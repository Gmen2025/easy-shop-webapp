export const SOCIAL_PROVIDERS = { google: 'Google', apple: 'Apple', facebook: 'Facebook' }

export function classifyAuthResponse(data) {
  if (!data || typeof data !== 'object') throw new Error('Invalid sign-in response.')
  if (data.requiresTwoFactor === true) {
    if (data.token || typeof data.challengeId !== 'string' || !data.challengeId ||
      !['authenticator', 'email'].includes(data.method)) throw new Error('Invalid verification challenge.')
    return { challenge: data }
  }
  const user = typeof data.user === 'object' ? data.user : data
  if (typeof data.token !== 'string' || !data.token || (!user?._id && !user?.id)) {
    throw new Error('The server returned an incomplete sign-in response.')
  }
  return { token: data.token, user }
}

export function socialSettings(data) {
  if (data?.success !== true || Object.keys(SOCIAL_PROVIDERS).some((key) =>
    typeof data.providers?.[key] !== 'boolean')) throw new Error('Social sign-in settings are unavailable.')
  return data.providers
}

export function socialCallback(search, pending, redirectUri, now = Date.now()) {
  const params = new URLSearchParams(search)
  if (!pending || pending.redirectUri !== redirectUri || !['E_Shopping', 'E_ShopUSA'].includes(pending.database) ||
    !Number.isFinite(pending.createdAt) || now - pending.createdAt > 600000 || now < pending.createdAt ||
    !/^[a-f0-9]{64}$/.test(pending.verifier)) throw new Error('Sign-in expired or was not started in this tab. Please try again.')
  if (params.has('error')) {
    const errors = {
      social_login_disabled: 'This provider was turned off. Please use email sign-in.',
      provider_unavailable: 'This provider is not configured yet. Please use email sign-in.',
      account_conflict: 'This email already has an account. Use its original sign-in method.',
      email_required: 'The provider must share a verified email address.',
    }
    throw new Error(errors[params.get('error')] || 'Social sign-in was not completed. Please try again.')
  }
  const code = params.get('code')
  if (!code) throw new Error('The provider did not return a sign-in code.')
  return code
}
