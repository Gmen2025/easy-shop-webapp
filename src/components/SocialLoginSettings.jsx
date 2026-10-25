import { useEffect, useState } from 'react'
import { apiRequest } from '../api/client'

const providerLabels = { google: 'Google', apple: 'Apple', facebook: 'Facebook' }

function validateSetting(setting) {
  if (setting?.success !== true || !setting.providers ||
      Object.keys(providerLabels).some((provider) => typeof setting.providers[provider] !== 'boolean')) {
    throw new Error('The server returned invalid social sign-in settings.')
  }
  return setting
}

export default function SocialLoginSettings() {
  const [setting, setSetting] = useState(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    apiRequest('/settings/social-login').then((result) => {
      if (active) setSetting(validateSetting(result))
    }).catch((requestError) => {
      if (active) setError(requestError.message)
    }).finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [])

  async function sync(provider, enabled) {
    setBusy(true)
    setError('')
    try {
      const options = provider === undefined ? {} : {
        method: 'PUT', body: JSON.stringify({ providers: { [provider]: enabled } }),
      }
      setSetting(validateSetting(await apiRequest('/settings/social-login', options)))
    } catch (requestError) {
      setSetting(null)
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h3>Social sign-in</h3>
        <span>{setting ? 'Provider settings loaded' : 'Status unavailable'}</span>
      </div>
      <p className="section-note">
        Control Google, Apple, and Facebook separately across all regions,
        development and production. Disabling a provider blocks its new and in-progress
        sign-ins, not other providers, existing sessions or email login. Mobile login screens refresh
        within 30 seconds while open or when reopened.
      </p>
      {error ? <p role="alert" className="form-error">{error}</p> : null}
      <div className="inline-actions">
        {Object.entries(providerLabels).map(([provider, label]) => (
          <button key={provider} type="button" role="switch"
            aria-checked={setting?.providers[provider] === true}
            aria-label={`Enable ${label} sign-in`}
            className="solid-button" disabled={busy || !setting}
            onClick={() => sync(provider, !setting.providers[provider])}>
            {label}: {busy ? 'Loading...' : !setting ? 'Unavailable' : setting.providers[provider] ? 'ON' : 'OFF'}
          </button>
        ))}
        <button type="button" className="ghost-button" disabled={busy} onClick={() => sync()}>
          Refresh social sign-in status
        </button>
      </div>
    </section>
  )
}
