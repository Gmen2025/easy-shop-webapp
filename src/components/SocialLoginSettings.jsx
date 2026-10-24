import { useEffect, useState } from 'react'
import { apiRequest } from '../api/client'

function validateSetting(setting) {
  if (setting?.success !== true || typeof setting.enabled !== 'boolean') {
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

  async function sync(enabled) {
    setBusy(true)
    setError('')
    try {
      const options = enabled === undefined ? {} : {
        method: 'PUT', body: JSON.stringify({ enabled }),
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
        <span>{setting ? (setting.enabled ? 'ON' : 'OFF') : 'Status unavailable'}</span>
      </div>
      <p className="section-note">
        One global switch for Google, Apple, and Facebook across all regions,
        development and production. Disabling blocks new and in-progress social
        sign-ins, not existing sessions or email login. Mobile login screens refresh
        within 30 seconds while open or when reopened.
      </p>
      {error ? <p role="alert" className="form-error">{error}</p> : null}
      <div className="inline-actions">
        <button type="button" role="switch" aria-checked={setting?.enabled === true}
          aria-label="Enable Google, Apple, and Facebook sign-in"
          className="solid-button" disabled={busy || !setting}
          onClick={() => sync(!setting.enabled)}>
          {busy ? 'Loading...' : setting?.enabled ? 'Turn social sign-in OFF' : 'Turn social sign-in ON'}
        </button>
        <button type="button" className="ghost-button" disabled={busy} onClick={() => sync()}>
          Refresh social sign-in status
        </button>
      </div>
    </section>
  )
}
