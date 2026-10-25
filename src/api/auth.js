import { API_BASE_URL, apiRequest, getSelectedDatabaseName } from './client'
import { socialCallback, socialSettings, SOCIAL_PROVIDERS } from '../utils/authFlow'

export const securityRequest = (path, body, database) => apiRequest(`/users/auth/${path}`, {
  ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
  ...(database ? { headers: { 'x-database-name': database } } : {}),
})

export const getSocialProviders = async () => socialSettings(await apiRequest('/settings/social-login', { cache: 'no-store' }))
const PENDING_KEY = 'socialSignIn'

export async function startSocialSignIn(provider) {
  if (!Object.hasOwn(SOCIAL_PROVIDERS, provider) || !(await getSocialProviders())[provider]) {
    throw new Error('This provider is unavailable. Please use email sign-in.')
  }
  const verifier = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, '0')).join('')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const redirectUri = `${window.location.origin}/login`
  const database = getSelectedDatabaseName()
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({ verifier, redirectUri, database, createdAt: Date.now() }))
  const url = new URL(`${API_BASE_URL}/users/auth/social/start`, window.location.origin)
  url.search = new URLSearchParams({ provider, redirectUri, codeChallenge: challenge, db: database }).toString()
  window.location.assign(url.toString())
}

export async function exchangeSocialCallback(search) {
  const stored = sessionStorage.getItem(PENDING_KEY)
  sessionStorage.removeItem(PENDING_KEY)
  const pending = stored ? JSON.parse(stored) : null
  const code = socialCallback(search, pending, `${window.location.origin}/login`)
  const data = await securityRequest('social/exchange', {
    code, codeVerifier: pending.verifier, databaseName: pending.database,
  }, pending.database)
  return { data, database: pending.database }
}
