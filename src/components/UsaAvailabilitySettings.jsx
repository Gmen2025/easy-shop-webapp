import { useEffect, useRef, useState } from 'react'
import { apiRequest } from '../api/client'

export default function UsaAvailabilitySettings() {
  const [enabled, setEnabled] = useState(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const guard = useRef(false)
  function parse(data) {
    if (typeof data?.enabled !== 'boolean') throw new Error('USA availability could not be verified.')
    return data.enabled
  }
  useEffect(() => {
    let active = true
    apiRequest('/settings/usa-availability')
      .then((data) => { if (active) { setEnabled(parse(data)); setError('') } })
      .catch((failure) => { if (active) setError(failure.message) })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [revision])
  async function save() {
    if (guard.current) return
    guard.current = true; setBusy(true); setError('')
    try {
      setEnabled(parse(await apiRequest('/settings/usa-availability', {
        method: 'PUT', body: JSON.stringify({ enabled: !enabled }),
      })))
    } catch (failure) { setError(failure.message); setEnabled(null) }
    finally { guard.current = false; setBusy(false) }
  }
  return <section className="panel page-stack">
    <h2>USA storefront</h2>
    <p>When OFF, only USA administrators and approved verified USA testers can browse and shop. Existing orders, payments and deliveries remain accessible. Sign in as a USA administrator and select USA below to manage USA tester emails.</p>
    {error ? <p role="alert">{error}</p> : null}
    <div className="action-row">
      <button type="button" role="switch" aria-label="Enable USA storefront" aria-checked={enabled === true}
        disabled={busy || enabled === null} onClick={save}>USA storefront: {enabled === null ? 'Unavailable' : enabled ? 'ON' : 'OFF'}</button>
      <button type="button" disabled={busy} onClick={() => { setBusy(true); setRevision((value) => value + 1) }}>Refresh USA availability</button>
    </div>
  </section>
}
