import { useEffect, useRef, useState } from 'react'
import { apiRequest, getSelectedDatabaseName } from '../api/client'
import { parsePaymentSettings, PAYMENT_LABELS } from '../utils/paymentAvailability'

export default function PaymentMethodSettings() {
  const [database, setDatabase] = useState(getSelectedDatabaseName)
  const [methods, setMethods] = useState(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const guard = useRef(false)
  useEffect(() => {
    let current = true
    apiRequest('/settings/payment-methods', { headers: { 'x-database-name': database } })
      .then((result) => { if (current) { setMethods(parsePaymentSettings(result)); setError('') } })
      .catch((failure) => { if (current) { setMethods(null); setError(failure.message) } })
      .finally(() => { if (current) setBusy(false) })
    return () => { current = false }
  }, [database])
  async function sync(key) {
    if (guard.current) return
    guard.current = true; setBusy(true); setError('')
    try {
      setMethods(parsePaymentSettings(await apiRequest('/settings/payment-methods', {
        headers: { 'x-database-name': database },
        ...(key ? { method: 'PUT', body: JSON.stringify({ methods: { [key]: !methods[key] } }) } : {}),
      })))
    } catch (failure) { setMethods(null); setError(failure.message) }
    finally { guard.current = false; setBusy(false) }
  }
  return <section className="panel"><h2>Payment methods</h2>
    <p>Control each method independently for USA and Ethio across website, mobile, development and production.
      Provider and currency requirements still apply. Turning off methods blocks new payment starts, not reconciliation of existing payments.</p>
    <label>Payment settings region<select value={database} disabled={busy} onChange={(event) => {
      setBusy(true); setMethods(null); setError(''); setDatabase(event.target.value)
    }}><option value="E_Shopping">Ethio</option><option value="E_ShopUSA">USA</option></select></label>
    {error ? <p role="alert">{error}</p> : null}
    <div className="action-row">{Object.entries(PAYMENT_LABELS).map(([key, label]) =>
      <button key={key} type="button" className="ghost-button" role="switch" aria-label={`Enable ${label}`}
        aria-checked={methods?.[key] === true} disabled={busy || !methods} onClick={() => sync(key)}>
        {label}: {methods ? methods[key] ? 'ON' : 'OFF' : 'Unavailable'}
      </button>)}</div>
    {methods && !Object.values(methods).some(Boolean) ? <p role="status">All payment methods are OFF for this region. Checkout will show a temporary-unavailable message.</p> : null}
    <button className="ghost-button" disabled={busy} onClick={() => sync()}>Refresh payment settings</button>
  </section>
}
