import { useCallback, useEffect, useRef, useState } from 'react'
import { apiRequest } from '../api/client'
import { formatInternationalChargeAmount, internationalStageLabel } from '../utils/internationalHub'

const keyFor = (shipment) => `${shipment.groupId}:${shipment.shipmentId}`

export default function InternationalDriverDeliveries() {
  const [deliveries, setDeliveries] = useState([])
  const [proof, setProof] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const guard = useRef(false)
  const load = useCallback(async () => {
    const result = await apiRequest('/international/driver/deliveries')
    if (!Array.isArray(result)) throw new Error('The server returned an invalid international driver delivery list.')
    setDeliveries(result)
  }, [])
  useEffect(() => {
    let active = true
    queueMicrotask(() => { if (active) load().catch((failure) => setError(failure.message)) })
    return () => { active = false }
  }, [load])

  async function act(shipment, action) {
    if (guard.current) return
    const key = keyFor(shipment)
    const note = String(proof[key] || '').trim()
    if (action === 'deliver' && !note) { setError('Enter delivery proof (recipient name or confirmation).'); return }
    guard.current = true; setBusy(true); setError('')
    try {
      await apiRequest(`/international/driver/deliveries/${encodeURIComponent(shipment.groupId)}/${encodeURIComponent(shipment.shipmentId)}/${action}`, {
        method: 'POST', body: JSON.stringify(action === 'deliver' ? { note } : {}),
      })
      await load()
      setProof((previous) => ({ ...previous, [key]: '' }))
    } catch (failure) { setError(failure.message || 'International delivery update failed.') }
    finally { guard.current = false; setBusy(false) }
  }

  return <section className="panel international-driver-section">
    <p className="company-eyebrow">Final-mile service</p><h2>International deliveries</h2>
    <p>These assignments run in your signed-in destination region. Confirm hub pickup, then record recipient delivery proof.</p>
    {error ? <p role="alert">{error}</p> : null}
    <button className="ghost-button" disabled={busy} onClick={() => load().catch((failure) => setError(failure.message))}>Refresh international deliveries</button>
    {deliveries.length ? deliveries.map((shipment) => {
      const key = keyFor(shipment)
      return <article className="order-card" key={key}>
        <h3>{shipment.trackingCode || 'International shipment'}</h3>
        <p>{internationalStageLabel(shipment.destination?.stage)} · {shipment.recipient?.label || 'Recipient'}</p>
        <p>Pickup from {shipment.pickupFrom?.name || 'AdduGenet hub'}: {shipment.pickupFrom?.address || 'Address unavailable'}</p>
        <p>Deliver to {[shipment.recipient?.address1, shipment.recipient?.city, shipment.recipient?.country].filter(Boolean).join(', ')}</p>
        <p>Recipient phone: {shipment.recipient?.phone || 'Not provided'}</p>
        <p>Customs payment: {shipment.destination?.charges?.status || 'Not recorded'} · {formatInternationalChargeAmount(shipment.destination?.charges?.total || 0, shipment.destination?.charges?.currency || shipment.currency)}</p>
        {shipment.actions?.includes('pickup') ? <button className="solid-button" disabled={busy} onClick={() => act(shipment, 'pickup')}>Confirm picked up from hub</button> : null}
        {shipment.actions?.includes('deliver') ? <>
          <label>Delivery proof (recipient name or confirmation)<input required maxLength={300} value={proof[key] || ''}
            onChange={(event) => setProof((previous) => ({ ...previous, [key]: event.target.value }))} /></label>
          <button className="solid-button" disabled={busy || !String(proof[key] || '').trim()} onClick={() => act(shipment, 'deliver')}>Confirm delivered</button>
        </> : null}
      </article>
    }) : <p>No international deliveries assigned.</p>}
  </section>
}
