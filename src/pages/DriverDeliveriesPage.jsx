import { useCallback, useEffect, useRef, useState } from 'react'
import { apiRequest } from '../api/client'
import { orderAction } from '../api/delivery'
import { addressText, latLng } from '../utils/delivery'
import { formatCurrency } from '../utils/format'
import DeliveryMap from '../components/DeliveryMap'
import DeliveryWindow from '../components/DeliveryWindow'

export default function DriverDeliveriesPage() {
  const [offers, setOffers] = useState([])
  const [queue, setQueue] = useState([])
  const [eligibility, setEligibility] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [route, setRoute] = useState(null)
  const [location, setLocation] = useState(null)
  const [sharing, setSharing] = useState(false)
  const [gpsStatus, setGpsStatus] = useState('GPS is off.')
  const [error, setError] = useState('')
  const [routeError, setRouteError] = useState('')
  const [busy, setBusy] = useState(false)
  const actionGuard = useRef(false)
  const locationRef = useRef(null)
  const selected = queue.find((entry) => entry.orderId === selectedId)
  const stage = selected?.deliveryStatus
  const routeTiming = useRef({ next: 0 })
  const load = useCallback(async () => {
    const [offered, active] = await Promise.all([
      apiRequest('/orders/company/my-deliveries'), apiRequest('/drivers/me/queue'),
    ])
    if (!Array.isArray(offered.orders) || !Array.isArray(active.queue)) throw new Error('The API returned an invalid driver delivery response.')
    setOffers(offered.orders); setQueue(active.queue)
    setEligibility(offered.driverEligibility?.message || '')
  }, [])
  useEffect(() => {
    let current = true
    let pending = false
    async function refresh() {
      if (pending) return
      pending = true
      try { await load(); if (current) setError('') }
      catch (failure) { if (current) setError(failure.message) }
      finally { pending = false }
    }
    refresh()
    const timer = setInterval(refresh, 15000)
    return () => { current = false; clearInterval(timer) }
  }, [load])

  useEffect(() => {
    if (!sharing) return undefined
    if (!navigator.geolocation) return undefined
    let current = true
    let sending = false
    let lastSent = 0
    const watch = navigator.geolocation.watchPosition(async (position) => {
      const point = { latitude: position.coords.latitude, longitude: position.coords.longitude }
      locationRef.current = { ...point, timestamp: position.timestamp }
      setLocation(point)
      if (sending || Date.now() - lastSent < 15000) return
      sending = true; lastSent = Date.now()
      try {
        await apiRequest('/rides/me/location', { method: 'POST', body: JSON.stringify(point), timeoutMs: 20000 })
        if (current) setGpsStatus(`GPS shared at ${new Date().toLocaleTimeString()}. Keep this page open.`)
      } catch (failure) { if (current) setGpsStatus(`GPS update failed: ${failure.message}`) }
      finally { sending = false }
    }, (failure) => {
      if (current) {
        locationRef.current = null
        setLocation(null)
        setGpsStatus(`GPS unavailable: ${failure.message}. Allow location access and retry.`)
      }
    }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 })
    return () => { current = false; navigator.geolocation.clearWatch(watch) }
  }, [sharing])

  useEffect(() => {
    let current = true
    let pending = false
    async function fetchRoute() {
      if (!selectedId || !['Driver Assigned', 'Picked Up'].includes(stage)) return
      const origin = locationRef.current
      if (!origin || Date.now() - origin.timestamp > 120000) {
        if (current) {
          setLocation(null)
          setRouteError('Enable live GPS and wait for a fresh position before calculating your route.')
        }
        return
      }
      if (pending || Date.now() < routeTiming.current.next) return
      pending = true; routeTiming.current.next = Date.now() + 60000
      try {
        const result = await apiRequest(`/drivers/me/orders/${selectedId}/route`, {
          method: 'POST', body: JSON.stringify({ origin }), timeoutMs: 20000,
        })
        if (!Array.isArray(result.coordinates) || result.coordinates.length < 2 ||
            result.coordinates.some((point) => !latLng(point)) ||
            !Number.isFinite(result.distance) || result.distance < 0 ||
            !Number.isFinite(result.duration) || result.duration < 0) throw new Error('The API returned an invalid Google driving route.')
        if (current) { setRoute({ ...result, orderId: selectedId, stage }); setRouteError('') }
      } catch (failure) { if (current) setRouteError(failure.message) }
      finally { pending = false }
    }
    fetchRoute()
    const timer = setInterval(fetchRoute, 10000)
    return () => { current = false; clearInterval(timer) }
  }, [selectedId, stage])

  async function act(id, action, data) {
    if (actionGuard.current) return
    actionGuard.current = true; setBusy(true); setError('')
    try {
      await orderAction(id, action, data)
      routeTiming.current.next = Math.min(routeTiming.current.next, Date.now() + 10000)
      await load()
    } catch (failure) { setError(failure.message) }
    finally { actionGuard.current = false; setBusy(false) }
  }
  const freshLocation = sharing ? location : null
  const shownRoute = freshLocation && route?.orderId === selectedId && route.stage === stage ? route : null
  return <section className="panel delivery-page">
    <h1>Company driver deliveries</h1>
    <p>Use the same account and shopping region as the mobile app. Offers, active queue, pickup and drop-off statuses are shared.
      This interface requires an approved company-driver account.</p>
    {error ? <p role="alert">{error}</p> : null}
    {eligibility ? <p role="status">{eligibility}</p> : null}
    <div className="action-row">
      <button className="ghost-button" disabled={busy} onClick={() => load().catch((failure) => setError(failure.message))}>Refresh deliveries</button>
      <button className="solid-button" onClick={() => {
        if (!navigator.geolocation) { setGpsStatus('Geolocation is unavailable. Use HTTPS or localhost with a supported browser.'); return }
        setSharing(!sharing)
        if (sharing) { locationRef.current = null; setLocation(null); setRoute(null); setGpsStatus('GPS sharing stopped.') }
      }}>{sharing ? 'Stop GPS sharing' : 'Enable live GPS'}</button>
    </div>
    <p role="status">{gpsStatus}</p>
    <h2>Delivery offers</h2>
    {offers.length ? offers.map((offer) => <article key={offer._id} className="order-card">
      <h3>{offer.store?.name || 'Store'} - #{offer._id}</h3>
      <p>{offer.store?.address} | {offer.requiredVehicle} | {formatCurrency(offer.deliveryFee)}</p>
      <p>Drop-off: {addressText(offer.dropoffAddress)}</p>
      <DeliveryWindow value={offer} />
      <button disabled={busy} className="solid-button" onClick={() => act(offer._id, 'company-claim')}>Claim delivery</button>
      <button disabled={busy} className="ghost-button" onClick={() => {
        if (window.confirm('Reroute this offer to another eligible driver?')) act(offer._id, 'company-reroute')
      }}>Reroute offer</button>
      <button disabled={busy} className="ghost-button" onClick={() => {
        if (window.confirm('Reject this offer for Admin review?')) act(offer._id, 'company-reject')
      }}>Reject for Admin review</button>
    </article>) : <p>No offers. The server controls eligibility, assignment and vehicle compatibility.</p>}
    <h2>Active pickup & drop-off queue</h2>
    {queue.length ? queue.map((entry) => <article className="order-card" key={entry.orderId}>
      <h3>{entry.store?.name} - #{entry.orderId}</h3>
      <p>Batch: {entry.queueBatchId || 'Individual'} | Sequence: {entry.queueSequence} | {entry.deliveryStatus}</p>
      <p>Pickup: {entry.store?.address}</p>
      <p>Drop-off: {entry.address ? addressText(entry.address) : `${entry.dropZone?.city || 'Delivery area'} (exact address unlocks after pickup)`}</p>
      {entry.customer?.phone ? <p>Recipient: {entry.customer.name} - <a href={`tel:${entry.customer.phone.replace(/[^\d+]/g, '')}`}>{entry.customer.phone}</a></p> : null}
      <DeliveryWindow value={entry} />
      {entry.items.map((item, index) => <p key={index}>{item.quantity} x {item.name}</p>)}
      <button className="ghost-button" onClick={() => {
        if (selectedId !== entry.orderId) {
          routeTiming.current.next = Math.min(routeTiming.current.next, Date.now() + 10000)
          setSelectedId(entry.orderId)
        }
      }}>Show current leg on Google Maps</button>
      <button disabled={busy} className="solid-button" onClick={() => {
        const status = entry.deliveryStatus === 'Picked Up' ? 'Delivered' : 'Picked Up'
        if (window.confirm(status === 'Picked Up' ? 'Confirm the goods have been picked up from this store?' : 'Confirm this delivery was handed to the recipient?')) {
          act(entry.orderId, '', { deliveryStatus: status })
        }
      }}>{entry.deliveryStatus === 'Picked Up' ? 'Confirm drop-off / delivered' : 'Confirm picked up'}</button>
    </article>) : <p>No active deliveries.</p>}
    {selected ? <article className="order-card"><h2>{stage === 'Picked Up' ? 'Drop-off' : 'Pickup'} driving route</h2>
      <p>Route starts at your live GPS position{freshLocation ? ` (${freshLocation.latitude.toFixed(5)}, ${freshLocation.longitude.toFixed(5)})` : ' (not available)'}.</p>
      <p>Route ends at {stage === 'Picked Up' ? `the recipient: ${addressText(selected.address)}` :
        `the assigned pickup store: ${selected.store?.name} - ${selected.store?.address}`}.</p>
      <p>Pickup selection is based on eligible stock near the customer's delivery address, not the driver's GPS location. Store ID: {selected.store?.id}</p>
      {routeError ? <p role="alert">{routeError}</p> : null}
      {shownRoute ? <p>{shownRoute.distance.toFixed(2)} km | {Math.ceil(shownRoute.duration)} minutes (Google route estimate)</p> : null}
      <DeliveryMap pickup={selected.store?.location} dropoff={stage === 'Picked Up' ? { coordinates: selected.address?.coordinates } : null}
        driver={freshLocation} coordinates={shownRoute?.coordinates} requireDriverOrigin />
      <p className="section-note">Google road routes refresh at most once per minute. No straight-line route is substituted when Google fails.
        Browser GPS requires permission and HTTPS (or localhost); background tracking is not guaranteed.</p>
    </article> : null}
  </section>
}
