import { API_BASE_URL, apiRequest, getSelectedDatabaseName } from './client'
import { socialCallback, socialSettings, SOCIAL_PROVIDERS } from '../utils/authFlow'

export const securityRequest = (path, body, database) => apiRequest(`/users/auth/${path}`, {
  ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
  ...(database ? { headers: { 'x-database-name': database } } : {}),
})

export const getSocialProviders = async () => socialSettings(await apiRequest('/settings/social-login', { cache: 'no-store' }))
const PENDING_KEY = 'socialSignIn'

async function createSocialPending() {
  const verifier = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, '0')).join('')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const redirectUri = `${window.location.origin}/login`
  const database = getSelectedDatabaseName()
  return { pending: { verifier, redirectUri, database, createdAt: Date.now() }, challenge }
}

export async function startSocialSignIn(provider) {
  if (!Object.hasOwn(SOCIAL_PROVIDERS, provider) || !(await getSocialProviders())[provider]) {
    throw new Error('This provider is unavailable. Please use email sign-in.')
  }
  const { pending, challenge } = await createSocialPending()
  const { redirectUri, database } = pending
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending))
  const url = new URL(`${API_BASE_URL}/users/auth/social/start`, window.location.origin)
  url.search = new URLSearchParams({ provider, redirectUri, codeChallenge: challenge, db: database }).toString()
  window.location.assign(url.toString())
}

export async function startGoogleLink(proof) {
  if (!(await getSocialProviders()).google) throw new Error('Google linking is currently unavailable.')
  const user = JSON.parse(localStorage.getItem('authUser') || 'null')
  const userId = user?._id || user?.id
  if (!localStorage.getItem('authToken') || !userId) throw new Error('Sign in to your account before linking Google.')
  const { pending, challenge } = await createSocialPending()
  const result = await securityRequest('social/link/start', {
    ...proof, provider: 'google', redirectUri: pending.redirectUri,
    codeChallenge: challenge, databaseName: pending.database,
  }, pending.database)
  const url = new URL(result.authorizationUrl)
  if (url.origin !== 'https://accounts.google.com' || url.pathname !== '/o/oauth2/v2/auth') {
    throw new Error('The server returned an invalid Google linking URL.')
  }
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({ ...pending, purpose: 'link', userId }))
  window.location.assign(url.toString())
}

export async function exchangeSocialCallback(search) {
  const stored = sessionStorage.getItem(PENDING_KEY)
  sessionStorage.removeItem(PENDING_KEY)
  const pending = stored ? JSON.parse(stored) : null
  const code = socialCallback(search, pending, `${window.location.origin}/login`)
  const linking = pending.purpose === 'link'
  if (linking) {
    const user = JSON.parse(localStorage.getItem('authUser') || 'null')
    if (!localStorage.getItem('authToken') || pending.userId !== (user?._id || user?.id) ||
      pending.database !== getSelectedDatabaseName()) {
      throw new Error('Your account or region changed. Start Google linking again from Security Settings.')
    }
  }
  const data = await securityRequest(linking ? 'social/link/exchange' : 'social/exchange', {
    code, codeVerifier: pending.verifier, databaseName: pending.database,
  }, pending.database)
  if (linking) {
    if (data?.linked !== true || data.provider !== 'google') throw new Error('The server did not confirm Google linking.')
    return { linked: true }
  }
  return { data, database: pending.database }
}
