import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { classifyAuthResponse, socialCallback, socialSettings } from '../src/utils/authFlow.js'

const challenge = { requiresTwoFactor: true, challengeId: 'opaque-challenge', method: 'email' }
const session = { token: 'test-session-token', _id: '111111111111111111111111', name: 'Test Customer', email: 'customer@example.test' }

test('auth classification never turns a challenge into a session and rejects incomplete results', () => {
  assert.deepEqual(classifyAuthResponse(challenge), { challenge })
  assert.equal(classifyAuthResponse(session).token, session.token)
  assert.equal(classifyAuthResponse({ user: session, token: session.token }).user._id, session._id)
  for (const invalid of [null, {}, { token: 'token' }, { ...challenge, token: 'token' },
    { ...challenge, method: 'sms' }, { ...challenge, challengeId: '' }]) {
    assert.throws(() => classifyAuthResponse(invalid))
  }
})

test('social availability is per provider and fails closed on incomplete settings', () => {
  assert.deepEqual(socialSettings({ success: true, providers: { google: true, apple: false, facebook: false } }),
    { google: true, apple: false, facebook: false })
  for (const value of [{}, { success: true, providers: { google: true } }, { success: false }]) {
    assert.throws(() => socialSettings(value))
  }
})

test('social handoffs require this tab, matching redirect, bounded lifetime, valid verifier and database', () => {
  const redirect = 'https://addugeneteshop.com/login'
  const pending = { verifier: 'a'.repeat(64), redirectUri: redirect, database: 'E_ShopUSA', createdAt: 1000 }
  assert.equal(socialCallback('?code=opaque', pending, redirect, 2000), 'opaque')
  for (const bad of [null, { ...pending, database: 'other' }, { ...pending, verifier: 'short' },
    { ...pending, createdAt: 2001 }, { ...pending, redirectUri: 'https://elsewhere.test/login' }]) {
    assert.throws(() => socialCallback('?code=opaque', bad, redirect, 2000))
  }
  assert.throws(() => socialCallback('?code=opaque', pending, redirect, 602000), /expired/)
  assert.throws(() => socialCallback('?error=social_login_disabled', pending, redirect, 2000), /turned off/)
  assert.throws(() => socialCallback('?error=provider_unavailable', pending, redirect, 2000), /not configured/)
  assert.throws(() => socialCallback('?error=account_conflict', pending, redirect, 2000), /original sign-in/)
  assert.throws(() => socialCallback('', pending, redirect, 2000), /did not return/)
})

test('password and social login hold authentication until 2FA succeeds and retain the challenge region', async () => {
  const storage = new Map()
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const originalFetch = globalThis.fetch
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  } })
  const cacheDir = await mkdtemp(join(tmpdir(), 'web-auth-test-'))
  const { createServer } = await import('vite')
  const server = await createServer({
    configFile: false, cacheDir, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
  })
  try {
    const { configureStore } = await import('@reduxjs/toolkit')
    const { default: reducer, loginUser, verifyTwoFactor, finishSocialSignIn, cancelSignIn, logout } =
      await server.ssrLoadModule('/src/features/auth/authSlice.js')
    const store = configureStore({ reducer: { auth: reducer } })
    globalThis.fetch = async () => Response.json(challenge)
    await store.dispatch(loginUser({ email: session.email, password: 'fixture', databaseName: 'E_ShopUSA' }))
    assert.equal(store.getState().auth.token, null)
    assert.equal(storage.has('authToken'), false)
    assert.equal(storage.has('authUser'), false)
    assert.equal(store.getState().auth.challengeDatabase, 'E_ShopUSA')
    assert.equal(store.getState().auth.challenge.challengeId, challenge.challengeId)
    let verification
    globalThis.fetch = async (url, options) => {
      verification = { url, options }
      return Response.json({ message: 'Invalid security code' }, { status: 400 })
    }
    await store.dispatch(verifyTwoFactor({ code: '000000', useBackupCode: false }))
    assert.equal(store.getState().auth.token, null)
    assert.match(store.getState().auth.error, /Invalid security code/)
    assert.equal(store.getState().auth.challenge.challengeId, challenge.challengeId)
    globalThis.fetch = async (url, options) => {
      verification = { url, options }
      return Response.json(session)
    }
    await store.dispatch(verifyTwoFactor({ code: 'backup', useBackupCode: true }))
    assert.equal(verification.options.headers['x-database-name'], 'E_ShopUSA')
    assert.deepEqual(JSON.parse(verification.options.body), { challengeId: challenge.challengeId, code: 'backup', useBackupCode: true })
    assert.equal(storage.get('authToken'), session.token)
    assert.equal(storage.get('selectedDatabaseName'), 'E_ShopUSA')
    assert.equal(store.getState().auth.challenge, null)
    store.dispatch(logout())
    await store.dispatch(finishSocialSignIn({ data: challenge, database: 'E_Shopping' }))
    assert.equal(store.getState().auth.token, null)
    assert.equal(storage.has('authToken'), false)
    store.dispatch(cancelSignIn())
    assert.equal(store.getState().auth.challenge, null)
    await store.dispatch(finishSocialSignIn({ data: {}, database: 'E_Shopping' }))
    assert.equal(store.getState().auth.token, null)
    assert.match(store.getState().auth.error, /incomplete/)
    await store.dispatch(finishSocialSignIn({ data: session, database: 'E_Shopping' }))
    assert.equal(store.getState().auth.user.name, session.name)
    assert.equal(storage.get('authToken'), session.token)
  } finally {
    globalThis.fetch = originalFetch
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage)
    else delete globalThis.localStorage
    await server.close()
    await rm(cacheDir, { recursive: true, force: true })
  }
})
