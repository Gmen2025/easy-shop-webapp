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
  assert.throws(() => socialCallback('?error=link_email_mismatch', pending, redirect, 2000), /same email/)
  assert.throws(() => socialCallback('?error=link_expired', pending, redirect, 2000), /Security Settings/)
  assert.throws(() => socialCallback('', pending, redirect, 2000), /did not return/)
})

test('Google linking verifies ownership via POST and exchanges a separate handoff without changing the session', async () => {
  const storage = new Map([
    ['authToken', session.token], ['authUser', JSON.stringify(session)], ['selectedDatabaseName', 'E_ShopUSA'],
  ])
  const tab = new Map()
  const originals = new Map(['localStorage', 'sessionStorage', 'window'].map((key) =>
    [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  const originalFetch = globalThis.fetch
  const mockStorage = (map) => ({
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  })
  let destination
  for (const [key, value] of [
    ['localStorage', mockStorage(storage)], ['sessionStorage', mockStorage(tab)],
    ['window', { location: { origin: 'https://addugeneteshop.com', assign: (url) => { destination = url } } }],
  ]) Object.defineProperty(globalThis, key, { configurable: true, value })
  const cacheDir = await mkdtemp(join(tmpdir(), 'web-link-test-'))
  const { createServer } = await import('vite')
  const server = await createServer({
    configFile: false, cacheDir, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
  })
  try {
    const { startGoogleLink, exchangeSocialCallback } = await server.ssrLoadModule('/src/api/auth.js')
    const requests = []
    let enabled = true
    let authorizationUrl = 'https://accounts.google.com/o/oauth2/v2/auth?state=fixture'
    let exchangeResult = { linked: true, provider: 'google' }
    globalThis.fetch = async (url, options) => {
      requests.push({ url, options })
      if (url.endsWith('/settings/social-login')) {
        return Response.json({ success: true, providers: { google: enabled, apple: false, facebook: false } })
      }
      if (url.endsWith('/social/link/start')) return Response.json({ authorizationUrl })
      if (url.endsWith('/social/link/exchange')) return Response.json(exchangeResult)
      throw new Error(`Unexpected authentication request: ${url}`)
    }
    const proof = { password: 'fixture-password', code: '123456', useBackupCode: false, challengeId: 'management-fixture' }
    await startGoogleLink(proof)
    const start = requests.find(({ url }) => url.endsWith('/social/link/start'))
    const body = JSON.parse(start.options.body)
    assert.equal(start.options.method, 'POST')
    assert.equal(start.options.headers.Authorization, `Bearer ${session.token}`)
    assert.equal(start.options.headers['x-database-name'], 'E_ShopUSA')
    assert.deepEqual({ password: body.password, code: body.code, useBackupCode: body.useBackupCode,
      challengeId: body.challengeId }, proof)
    assert.equal(body.provider, 'google')
    assert.equal(body.redirectUri, 'https://addugeneteshop.com/login')
    assert.equal(body.databaseName, 'E_ShopUSA')
    assert.match(body.codeChallenge, /^[A-Za-z0-9_-]{43}$/)
    const pending = JSON.parse(tab.get('socialSignIn'))
    assert.equal(pending.purpose, 'link')
    assert.equal(pending.userId, session._id)
    assert.equal(pending.database, 'E_ShopUSA')
    assert.match(pending.verifier, /^[a-f0-9]{64}$/)
    assert.equal(Object.hasOwn(pending, 'password'), false)
    assert.equal(Object.hasOwn(pending, 'code'), false)
    assert.equal(destination, authorizationUrl)
    assert.deepEqual(await exchangeSocialCallback('?code=link-handoff'), { linked: true })
    const exchange = requests.find(({ url }) => url.endsWith('/social/link/exchange'))
    assert.deepEqual(JSON.parse(exchange.options.body), {
      code: 'link-handoff', codeVerifier: pending.verifier, databaseName: 'E_ShopUSA',
    })
    assert.equal(tab.has('socialSignIn'), false)
    assert.equal(storage.get('authToken'), session.token)
    assert.equal(storage.get('authUser'), JSON.stringify(session))
    assert.equal(storage.get('selectedDatabaseName'), 'E_ShopUSA')
    assert.equal(requests.some(({ url }) => url.endsWith('/social/exchange')), false)

    for (const change of [
      () => storage.set('selectedDatabaseName', 'E_Shopping'),
      () => storage.set('authUser', JSON.stringify({ ...session, _id: 'other-account' })),
      () => storage.delete('authToken'),
    ]) {
      storage.set('selectedDatabaseName', 'E_ShopUSA')
      storage.set('authUser', JSON.stringify(session))
      storage.set('authToken', session.token)
      tab.set('socialSignIn', JSON.stringify(pending))
      change()
      const count = requests.length
      await assert.rejects(exchangeSocialCallback('?code=link-handoff'), /account or region changed/)
      assert.equal(requests.length, count)
      assert.equal(tab.has('socialSignIn'), false)
    }
    storage.set('authToken', session.token)
    tab.set('socialSignIn', JSON.stringify(pending))
    await assert.rejects(exchangeSocialCallback('?error=link_email_mismatch'), /same email/)
    assert.equal(tab.has('socialSignIn'), false)
    exchangeResult = { linked: false, provider: 'google' }
    tab.set('socialSignIn', JSON.stringify(pending))
    await assert.rejects(exchangeSocialCallback('?code=link-handoff'), /did not confirm/)
    enabled = false
    await assert.rejects(startGoogleLink(proof), /unavailable/)
    enabled = true
    authorizationUrl = 'https://untrusted.example/auth'
    await assert.rejects(startGoogleLink(proof), /invalid Google linking URL/)
    assert.equal(tab.has('socialSignIn'), false)
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
