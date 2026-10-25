import { useEffect, useState } from 'react'
import { getSocialProviders, startSocialSignIn } from '../api/auth'
import { SOCIAL_PROVIDERS } from '../utils/authFlow'

export default function SocialSignIn({ disabled = false }) {
  const [providers, setProviders] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let current = true
    let revision = 0
    async function refresh() {
      const request = ++revision
      try {
        const result = await getSocialProviders()
        if (current && request === revision) { setProviders(result); setError('') }
      } catch (failure) {
        if (current && request === revision) { setProviders({}); setError(failure.message) }
      }
    }
    refresh()
    const interval = setInterval(refresh, 30000)
    window.addEventListener('focus', refresh)
    return () => { current = false; clearInterval(interval); window.removeEventListener('focus', refresh) }
  }, [])

  async function signIn(provider) {
    setBusy(true)
    setError('')
    try { await startSocialSignIn(provider) }
    catch (failure) { setError(failure.message); setBusy(false) }
  }
  return <div className="social-sign-in">
    {Object.values(providers).some(Boolean) ? <p className="auth-divider">Or continue with</p> : null}
    {Object.entries(SOCIAL_PROVIDERS).filter(([key]) => providers[key]).map(([key, label]) =>
      <button key={key} className={`social-provider social-${key}`} type="button" disabled={disabled || busy}
        onClick={() => signIn(key)}>Continue with {label}</button>)}
    {error ? <p className="form-error" role="alert">{error} Email sign-in is still available.</p> : null}
  </div>
}
