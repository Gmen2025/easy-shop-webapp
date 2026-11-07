import { useEffect, useRef, useState } from 'react'
import AdminNavigation from '../components/AdminNavigation'
import { apiRequest, getSelectedDatabaseName } from '../api/client'
import { SERVICE_LABELS, validateServiceAvailability } from '../utils/serviceAvailability'

export default function ServiceAvailabilitySettingsPage() {
  const [database, setDatabase] = useState(getSelectedDatabaseName)
  const [settings, setSettings] = useState(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  const guard = useRef(false)
  useEffect(() => {
    let active = true
    apiRequest('/settings/service-availability', { headers: { 'x-database-name': database } })
      .then((data) => { if (active) { setSettings(validateServiceAvailability(data)); setError('') } })
      .catch((failure) => { if (active) { setSettings(null); setError(failure.message) } })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [database, revision])
  async function save(key, enabled) {
    if (guard.current) return
    guard.current = true; setBusy(true); setError(''); setNotice('')
    try {
      setSettings(validateServiceAvailability(await apiRequest('/settings/service-availability', {
        method: 'PUT', headers: { 'x-database-name': database }, body: JSON.stringify({ [key]: enabled }),
      })))
      setNotice(`${SERVICE_LABELS[key]} ${enabled ? 'enabled' : 'disabled'} for ${database === 'E_ShopUSA' ? 'USA' : 'Ethiopia'}.`)
    } catch (failure) { setSettings(null); setError(failure.message) }
    finally { guard.current = false; setBusy(false) }
  }
  return <section className="page-stack admin-console">
    <AdminNavigation />
    <h1>Service availability</h1>
    <p>Separate switches for USA and Ethiopia. Off hides booking entry points and blocks new requests. Existing trips, requests, payments and admin/driver operations remain accessible.</p>
    <label>Service availability region<select value={database} disabled={busy} onChange={(event) => {
      setBusy(true); setSettings(null); setError(''); setNotice(''); setDatabase(event.target.value)
    }}><option value="E_Shopping">Ethiopia</option><option value="E_ShopUSA">USA</option></select></label>
    {busy && <p role="status">Loading availability...</p>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <div className="action-row">{Object.entries(SERVICE_LABELS).map(([key, label]) =>
      <button type="button" className="ghost-button" role="switch" key={key} aria-label={`Enable ${label}`}
        aria-checked={settings?.[key] === true} disabled={busy || !settings} onClick={() => save(key, !settings[key])}>
        {label}: {settings ? settings[key] ? 'ON' : 'OFF' : 'Unavailable'}
      </button>)}</div>
    <button disabled={busy} onClick={() => { setBusy(true); setSettings(null); setRevision((value) => value + 1) }}>Refresh availability</button>
    <p>Switches default ON to preserve existing behavior. Ride fare configuration must also be enabled before rides can be booked. These switches do not change country maintenance mode or erase fare settings.</p>
  </section>
}
