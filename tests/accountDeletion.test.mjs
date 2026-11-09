import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { configureStore } from '@reduxjs/toolkit'
import { createServer } from 'vite'

test('deletion requires server confirmation, preserves failed accounts, and clears successful sessions for all roles', async () => {
  const local = new Map()
  const tab = new Map()
  const originals = new Map(['localStorage', 'sessionStorage'].map((key) =>
    [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  const originalFetch = globalThis.fetch
  const storage = (map) => ({
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  })
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage(local) })
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: storage(tab) })
  const cacheDir = await mkdtemp(join(tmpdir(), 'web-deletion-test-'))
  const server = await createServer({
    configFile: false, cacheDir, server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] },
  })
  try {
    const { removeUserAccount } = await server.ssrLoadModule('/src/features/auth/authSlice.js')
    const { rootReducer } = await server.ssrLoadModule('/src/app/store.js')
    const initial = rootReducer(undefined, { type: 'test/init' })
    const userId = '111111111111111111111111'
    const token = 'disposable-fixture-token'
    function fixture(role = {}) {
      const user = { _id: userId, name: 'Disposable account', ...role }
      local.set('authUser', JSON.stringify(user))
      local.set('authToken', token)
      local.set('selectedDatabaseName', 'E_ShopUSA')
      local.set('shopCartItems_E_ShopUSA', '[]')
      tab.set('socialSignIn', 'pending-fixture')
      return configureStore({
        reducer: rootReducer,
        preloadedState: {
          ...initial,
          auth: { ...initial.auth, user, token, challenge: { challengeId: 'fixture' }, challengeDatabase: 'E_ShopUSA' },
          payment: { ...initial.payment, clientSecret: 'fixture-secret' },
          orders: { ...initial.orders, fixturePrivateData: 'private-order' },
          admin: { ...initial.admin, fixturePrivateData: 'private-admin-record' },
        },
      })
    }

    for (const failure of [
      { status: 409, message: 'Resolve active work and pending payouts first.' },
      { status: 503, message: 'Uploaded media deletion is unavailable. Try again later.' },
      { status: 500, message: 'Server deletion failed.' },
      { status: 404, message: 'User not found' },
      { status: 200, success: false, message: 'Deletion was not completed.' },
      { status: 200, html: true, message: 'The server did not confirm account deletion.' },
      { network: true, message: 'Failed to fetch' },
      { timeout: true, message: 'Request timed out. Please try again.' },
    ]) {
      const store = fixture()
      let calls = 0
      globalThis.fetch = async (url, options) => {
        calls++
        assert.ok(url.endsWith(`/users/${userId}`))
        assert.equal(options.method, 'DELETE')
        assert.equal(options.headers.Authorization, `Bearer ${token}`)
        assert.equal(options.headers['x-database-name'], 'E_ShopUSA')
        if (failure.network) throw new TypeError(failure.message)
        if (failure.timeout) throw new DOMException('Aborted', 'AbortError')
        if (failure.html) return new Response('<html>Unexpected page</html>', { headers: { 'content-type': 'text/html' } })
        return Response.json({ success: failure.success ?? false, message: failure.message }, { status: failure.status })
      }
      const result = await store.dispatch(removeUserAccount())
      assert.equal(removeUserAccount.rejected.match(result), true)
      assert.equal(result.payload, failure.message)
      assert.equal(calls, 1)
      assert.equal(store.getState().auth.token, token)
      assert.equal(store.getState().auth.user._id, userId)
      assert.equal(store.getState().auth.deletingAccount, false)
      assert.equal(store.getState().payment.clientSecret, 'fixture-secret')
      assert.equal(local.get('authToken'), token)
      assert.equal(tab.get('socialSignIn'), 'pending-fixture')
    }

    for (const role of [{}, { isDriver: true }, { isStoreOwner: true }]) {
      const store = fixture(role)
      let finish
      let calls = 0
      globalThis.fetch = () => {
        calls++
        return new Promise((resolve) => { finish = resolve })
      }
      const pending = store.dispatch(removeUserAccount())
      assert.equal(store.getState().auth.deletingAccount, true)
      const duplicate = await store.dispatch(removeUserAccount())
      assert.equal(duplicate.meta.condition, true)
      assert.equal(calls, 1)
      finish(Response.json({ success: true, message: 'Account deleted' }))
      assert.equal(removeUserAccount.fulfilled.match(await pending), true)
      const state = store.getState()
      assert.equal(state.auth.user, null)
      assert.equal(state.auth.token, null)
      assert.equal(state.auth.challenge, null)
      assert.equal(state.auth.challengeDatabase, null)
      assert.equal(state.auth.deletingAccount, false)
      assert.deepEqual(state.orders, initial.orders)
      assert.deepEqual(state.admin, initial.admin)
      assert.deepEqual(state.payment, initial.payment)
      assert.equal(local.has('authUser'), false)
      assert.equal(local.has('authToken'), false)
      assert.equal(tab.has('socialSignIn'), false)
      assert.equal(local.get('selectedDatabaseName'), 'E_ShopUSA')
      assert.equal(local.get('shopCartItems_E_ShopUSA'), '[]')
    }
    const invalid = fixture()
    invalid.dispatch({ type: 'auth/logout' })
    globalThis.fetch = () => { throw new Error('Must not request deletion without sign-in') }
    const result = await invalid.dispatch(removeUserAccount())
    assert.match(result.payload, /Sign in/)
  } finally {
    globalThis.fetch = originalFetch
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
    await server.close()
    await rm(cacheDir, { recursive: true, force: true })
  }
})

test('account settings and public notices explain permanent shared-backend deletion rather than local deletion', async () => {
  const page = await readFile(new URL('../src/pages/EditProfilePage.jsx', import.meta.url), 'utf8')
  assert.match(page, /Permanently delete your account/)
  assert.match(page, /disabled=\{deletingAccount \|\| profileLoading\}/)
  assert.match(page, /role="alert"/)
  assert.match(page, /href="\/account-deletion.html"/)
  assert.doesNotMatch(page, /Account deleted locally|removes your local sign-in/)
  for (const name of ['privacy.html', 'account-deletion.html']) {
    const policy = await readFile(new URL(`../public/${name}`, import.meta.url), 'utf8')
    assert.match(policy, /November 8, 2026/)
    assert.match(policy, /customer, driver, and store-owner accounts/)
    assert.match(policy, /pending payouts/)
    assert.match(policy, /previously issued tokens/i)
    assert.match(policy, /anonymiz/)
    assert.doesNotMatch(policy, /not automatic deletion|not guaranteed to be invalidated|not automatically deleted by the current/)
  }
})
