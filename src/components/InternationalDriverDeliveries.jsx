import { useCallback, useEffect, useRef, useState } from 'react'
import { apiRequest } from '../api/client'
import { formatInternationalChargeAmount, internationalStageLabel } from '../utils/internationalHub'
import InternationalDriverMap from './InternationalDriverMap'
import DeliveryMap from './DeliveryMap'
import { latLng } from '../utils/delivery'

const keyFor = (shipment) => `${shipment.groupId}:${shipment.shipmentId}`

export default function InternationalDriverDeliveries({ gps }) {
  const [deliveries, setDeliveries] = useState([])
  const [proof, setProof] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [selectedKey, setSelectedKey] = useState('')
  const [route, setRoute] = useState(null)
  const [routeError, setRouteError] = useState('')
  const guard = useRef(false)
  const routePanel = useRef(null)
  const nextRoute = useRef(0)
  const selected = deliveries.find((shipment) => keyFor(shipment) === selectedKey)
  const stage = selected?.actions?.includes('deliver') ? 'delivery' : 'pickup'
  const selectedGroup = selected?.groupId
  const selectedShipment = selected?.shipmentId
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

  useEffect(() => {
    if (selectedKey) routePanel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [selectedKey])
  useEffect(() => {
    if (!selectedGroup || !selectedShipment || !gps.sharing) return undefined
    let active = true
    let pending = false
    nextRoute.current = Math.min(nextRoute.current, Date.now() + 10000)
    async function fetchRoute() {
      const origin = gps.latest.current
      if (!origin || Date.now() - origin.timestamp > 120000) {
        if (active) setRouteError('Enable live GPS and wait for a fresh position before calculating your route.')
        return
      }
      if (pending || Date.now() < nextRoute.current) return
      pending = true
      nextRoute.current = Date.now() + 60000
      try {
        const result = await apiRequest(`/international/driver/deliveries/${encodeURIComponent(selectedGroup)}/${encodeURIComponent(selectedShipment)}/route`, {
          method: 'POST', body: JSON.stringify({ origin }), timeoutMs: 20000,
        })
        if (result.stage !== stage) throw new Error('Shipment stage changed. Refresh international deliveries.')
        if (!Array.isArray(result.coordinates) || result.coordinates.length < 2 ||
          result.coordinates.some((point) => !latLng(point)) || !latLng(result.destination) ||
          !Number.isFinite(result.distance) || result.distance < 0 ||
          !Number.isFinite(result.duration) || result.duration < 0) throw new Error('The server returned incomplete driving-route data.')
        if (active) { setRoute({ ...result, key: selectedKey }); setRouteError('') }
      } catch (failure) {
        if (active) {
          if (failure.status === 429) nextRoute.current = Date.now() + 10000
          setRoute(null); setRouteError(failure.message)
        }
      } finally { pending = false }
    }
    fetchRoute()
    const timer = setInterval(fetchRoute, 2000)
    return () => { active = false; clearInterval(timer) }
  }, [selectedGroup, selectedShipment, selectedKey, stage, gps.sharing, gps.latest])

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
      if (action === 'deliver') setSelectedKey('')
    } catch (failure) { setError(failure.message || 'International delivery update failed.') }
    finally { guard.current = false; setBusy(false) }
  }

  return <section className="panel international-driver-section">
    <p className="company-eyebrow">Final-mile service</p><h2>International deliveries</h2>
    <p>These assignments run in your signed-in destination region. Confirm hub pickup, then record recipient delivery proof.</p>
    <button className="ghost-button" onClick={gps.toggle}>{gps.sharing ? 'Stop GPS sharing' : 'Enable live GPS'}</button>
    <p role="status">{gps.status}</p>
    {gps.error ? <p role="alert">GPS: {gps.error}</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    <button className="ghost-button" disabled={busy} onClick={() => load().catch((failure) => setError(failure.message))}>Refresh international deliveries</button>
    {deliveries.length ? deliveries.map((shipment) => {
      const key = keyFor(shipment)
      return <article className="order-card" key={key}>
        <h3>{shipment.trackingCode || 'International shipment'}</h3>
        <p>{internationalStageLabel(shipment.destination?.stage)} · {shipment.recipient?.label || 'Recipient'}</p>
        <p>Pickup from {shipment.pickupFrom?.name || 'AdduGenet hub'}: {shipment.pickupFrom?.address || 'Address unavailable'}</p>
        <p>Deliver to {[shipment.recipient?.address1, shipment.recipient?.address2, shipment.recipient?.city, shipment.recipient?.zip, shipment.recipient?.country || shipment.destinationCountry].filter(Boolean).join(', ')}</p>
        <p>Recipient phone: {shipment.recipient?.phone || 'Not provided'}</p>
        <button className="ghost-button" onClick={() => setSelectedKey(key)}>Show current driving route</button>
        <InternationalDriverMap shipment={shipment} />
        <p>Customs payment: {shipment.destination?.charges?.status || 'Not recorded'} · {formatInternationalChargeAmount(shipment.destination?.charges?.total || 0, shipment.destination?.charges?.currency || shipment.currency)}</p>
        {shipment.actions?.includes('pickup') ? <button className="solid-button" disabled={busy} onClick={() => {
          if (window.confirm('Confirm the shipment was collected from the hub?')) act(shipment, 'pickup')
        }}>Confirm picked up from hub</button> : null}
        {shipment.actions?.includes('deliver') ? <>
          <label>Delivery proof (recipient name or confirmation)<input required maxLength={300} value={proof[key] || ''}
            onChange={(event) => setProof((previous) => ({ ...previous, [key]: event.target.value }))} /></label>
          <button className="solid-button" disabled={busy || !String(proof[key] || '').trim()} onClick={() => {
            if (window.confirm('Confirm the shipment was handed to the recipient?')) act(shipment, 'deliver')
          }}>Confirm delivered</button>
        </> : null}
      </article>
    }) : <p>No international deliveries assigned.</p>}
    {selected ? <article className="order-card" ref={routePanel}>
      <h3>{stage === 'pickup' ? 'Hub pickup' : 'Recipient delivery'} driving route</h3>
      <p>Route starts at your live GPS position and ends at {stage === 'pickup'
        ? `${selected.pickupFrom?.name || 'the hub'}: ${selected.pickupFrom?.address || 'address unavailable'}`
        : [selected.recipient?.address1, selected.recipient?.address2, selected.recipient?.city, selected.recipient?.zip, selected.recipient?.country || selected.destinationCountry].filter(Boolean).join(', ')}.</p>
      {!gps.sharing || !gps.point ? <p role="status">Enable live GPS and wait for a fresh location to calculate the current driving leg.</p> : null}
      {gps.sharing && routeError ? <p role="alert">{routeError}</p> : null}
      {gps.sharing && gps.point && route?.key === selectedKey && route.stage === stage ? <>
        <p>{route.distance.toFixed(2)} km | {Math.ceil(route.duration)} minutes (Google road route estimate)</p>
        <DeliveryMap pickup={stage === 'pickup' ? route.destination : null} dropoff={stage === 'delivery' ? route.destination : null}
          driver={gps.point} coordinates={route.coordinates} requireDriverOrigin />
      </> : null}
      {stage === 'pickup' ? <button className="solid-button" disabled={busy} onClick={() => {
        if (window.confirm('Confirm the shipment was collected from the hub?')) act(selected, 'pickup')
      }}>Confirm pickup from hub</button> : <>
        <label>Delivery proof (recipient name or confirmation)<input required maxLength={300} value={proof[selectedKey] || ''}
          onChange={(event) => setProof((previous) => ({ ...previous, [selectedKey]: event.target.value }))} /></label>
        <button className="solid-button" disabled={busy || !String(proof[selectedKey] || '').trim()} onClick={() => {
          if (window.confirm('Confirm the shipment was handed to the recipient?')) act(selected, 'deliver')
        }}>Confirm delivery</button>
      </>}
      <p>Road routes refresh at most once per minute. Pickup and delivery must be confirmed separately; no straight-line route is substituted.</p>
    </article> : null}
  </section>
}
