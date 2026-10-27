import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { apiRequest } from '../api/client'
import { orderAction } from '../api/delivery'
import { addressText, latLng } from '../utils/delivery'
import { formatCurrency } from '../utils/format'
import DeliveryMap from '../components/DeliveryMap'
import DeliveryWindow from '../components/DeliveryWindow'
import CompanyNavigation, { CompanyMetrics, CompanyPeriods } from '../components/CompanyNavigation'
import useCompanyResource from '../features/company/useCompanyResource'
import useDriverLocation from '../features/company/useDriverLocation'
import { requireList, validateCompanyDashboard, validateDriverRides } from '../utils/company'

const dashboardResponse = (data) => validateCompanyDashboard(data, 'driver')
const completedResponse = (data) => requireList(data?.orders, 'completed deliveries')

export default function DriverDeliveriesPage() {
  const user = useSelector((state) => state.auth.user)
  const driverName = user?.name
  const companyDriver = Boolean(user?.isCompanyOwnedDriver)
  const analytics = useCompanyResource('/drivers/me/dashboard', dashboardResponse, 60000)
  const completed = useCompanyResource('/drivers/me/completed-today', completedResponse, 60000)
  const rides = useCompanyResource('/rides/me/driver', validateDriverRides, 15000, companyDriver)
  const [period, setPeriod] = useState('daily')
  const [offers, setOffers] = useState([])
  const [queue, setQueue] = useState([])
  const [routeStops, setRouteStops] = useState([])
  const [eligibility, setEligibility] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [route, setRoute] = useState(null)
  const gps = useDriverLocation()
  const { point: location, sharing, status: gpsStatus, latest: locationRef } = gps
  const [error, setError] = useState('')
  const [routeError, setRouteError] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const actionGuard = useRef(false)
  const routePanel = useRef(null)
  const selected = queue.find((entry) => entry.orderId === selectedId)
  const stage = selected?.deliveryStatus
  const dropoffBlocked = stage === 'Picked Up' && selected?.dropoffReady === false
  const routeTiming = useRef({ next: 0 })
  useEffect(() => {
    if (selectedId) routePanel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [selectedId])
  const load = useCallback(async () => {
    const [offered, active] = await Promise.all([
      apiRequest('/drivers/me/available-deliveries', { timeoutMs: 20000 }), apiRequest('/drivers/me/queue', { timeoutMs: 20000 }),
    ])
    if (!Array.isArray(offered.orders) || !Array.isArray(active.queue)) throw new Error('The API returned an invalid driver delivery response.')
    setOffers(offered.orders); setQueue(active.queue); setRouteStops(active.routeStops || [])
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
    window.addEventListener('focus', refresh)
    return () => { current = false; clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [load])

  useEffect(() => {
    let current = true
    let pending = false
    async function fetchRoute() {
      if (!selectedId || !['Driver Assigned', 'Picked Up'].includes(stage)) return
      if (dropoffBlocked) {
        if (current) setRouteError('Complete all pickups for this customer cart before starting any drop-off.')
        return
      }
      const origin = locationRef.current
      if (!origin || Date.now() - origin.timestamp > 120000) {
        if (current) {
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
  }, [selectedId, stage, dropoffBlocked, locationRef])

  async function act(id, action, data) {
    if (actionGuard.current) return
    actionGuard.current = true; setBusy(true); setError(''); setNotice('')
    try {
      if (action === 'claim') {
        await apiRequest(`/drivers/me/available-deliveries/${id}/claim`, { method: 'PUT', body: '{}' })
      } else await orderAction(id, action, data)
      routeTiming.current.next = Math.min(routeTiming.current.next, Date.now() + 10000)
      await load()
      if (!action && data?.deliveryStatus === 'Delivered') await Promise.all([analytics.reload(), completed.reload()])
      setNotice(data?.deliveryStatus === 'Delivered' ? 'Delivery completed. The queue and earnings have been refreshed.' :
        data?.deliveryStatus === 'Picked Up' ? 'Pickup confirmed. Complete all pickups for this cart before starting any drop-off.' : 'Delivery response saved.')
    } catch (failure) { setError(failure.message) }
    finally { actionGuard.current = false; setBusy(false) }
  }
  const freshLocation = sharing ? location : null
  const shownRoute = !dropoffBlocked && freshLocation && route?.orderId === selectedId && route.stage === stage ? route : null
  const summary = analytics.data?.periods[period]
  const activeAssignments = new Set(queue.map((entry) =>
    entry.cartRouteVersion === 1 ? entry.checkoutGroup : entry.orderId)).size
  return <section className="page-stack company-console company-driver delivery-page">
    <CompanyNavigation driver rides={companyDriver} />
    {companyDriver ? <article className="panel company-ride-service"><p className="company-eyebrow">Ride service</p><h2>Passenger assignments</h2>
      <p>Separate ride offers, passenger route and service preferences.</p>
      {rides.error ? <p role="alert">{rides.error}</p> : null}
      {rides.data ? <><p>Approval: {rides.data.driver.approvalStatus} | {rides.data.driver.isAvailable ? 'Online' : 'Offline'}
        {rides.data.driver.isSuspended ? ' - Suspended' : ''}</p>
        <p>Vehicle: {rides.data.driver.vehicleType} | Passenger seats: {rides.data.driver.passengerSeats || 'Not configured'}
          {rides.data.driver.carClass ? ` | ${rides.data.driver.carClass}` : ''}</p>
        <p>Regular rides: {rides.data.driver.serviceModes.regular ? 'Enabled' : 'Disabled'} | Shared rides: {rides.data.driver.serviceModes.shared ? 'Enabled' : 'Disabled'}</p>
        {rides.data.driver.pendingVehicleType ? <p>Vehicle change awaiting Admin verification: {rides.data.driver.pendingVehicleType}. New passenger offers are paused.</p> : null}
        {rides.data.driver.rideProfilePhotoRequired ? <p>Refresh your ride profile photo to receive offers (every 90 days).</p> : null}
        <p>{rides.data.trip ? 'Active passenger route. ' : ''}{rides.data.offer ? 'A ride offer is waiting. Open assignments to respond.' : 'No current ride offer.'}</p>
      </> : null}
      <Link className="solid-button" to="/driver/rides">Open ride assignments & route</Link>
    </article> : null}
    <article className="panel company-heading"><div><p className="company-eyebrow">Driver</p><h1>Delivery Dispatch</h1>
      <h2>{driverName || 'Driver'}</h2>
      <p>{activeAssignments} Active Route(s) | {offers.length} Unassigned</p></div></article>
    <article className="panel"><p className="company-eyebrow">Delivery income</p><h2>Earnings overview</h2>
      <CompanyPeriods value={period} onChange={setPeriod} />
      {analytics.error ? <p role="alert">{analytics.error}</p> : null}
      {analytics.loading && !analytics.data ? <p role="status">Loading earnings...</p> : null}
      {summary ? <><div className="company-sales"><div>Income<strong>{formatCurrency(summary.income)}</strong></div></div>
        <CompanyMetrics items={[['Deliveries', summary.deliveries], ['Average fee', formatCurrency(summary.averageFee)],
          ['Distance', `${summary.distanceKm.toFixed(1)} km`], ['Active now', activeAssignments]]} />
        <h3>Recent completions</h3>
        {analytics.data.recentDeliveries.length ? analytics.data.recentDeliveries.map((entry) => <div key={entry._id} className="company-order-row">
          <span>{entry.storeName} | #{entry._id.slice(-6)} | {new Date(entry.deliveredAt).toLocaleDateString()}<DeliveryWindow value={entry} /></span>
          <strong>{formatCurrency(entry.deliveryFee)}</strong></div>) : <p>No recent completions.</p>}
      </> : null}
      <button className="ghost-button" disabled={analytics.loading} onClick={() => { analytics.reload().catch((failure) => setError(failure.message)) }}>Refresh earnings</button>
    </article>
    <article className="panel company-completed"><h2>Completed Today ({completed.data?.length ?? '...'})</h2>
      {completed.error ? <p role="alert">{completed.error}</p> : null}
      {completed.data?.map((entry) => <p key={entry._id}>Order #{entry._id.slice(-6)} | {entry.storeName || 'Store'}</p>)}
      {completed.data?.length === 0 ? <p>No deliveries completed today.</p> : null}
    </article>
    <article className="panel">
    <p>Use the same account and shopping region as the mobile app. Offers, active queue, pickup and drop-off statuses are shared.
      Available assignments are shared with eligible company and partner drivers. The first successful claim gets the complete cart.</p>
    {error ? <p role="alert">{error}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {eligibility ? <p role="status">{eligibility}</p> : null}
    <div className="action-row">
      <button className="ghost-button" disabled={busy || analytics.loading || completed.loading || rides.loading} onClick={() => {
        Promise.all([load(), analytics.reload(), completed.reload(), rides.reload()])
          .then(() => setError('')).catch((failure) => setError(failure.message))
      }}>Refresh Data</button>
      <button className="solid-button" onClick={() => { setRoute(null); gps.toggle() }}>{sharing ? 'Stop GPS sharing' : 'Enable live GPS'}</button>
    </div>
    <p role="status">{gpsStatus}</p>
    {gps.error ? <p role="alert">GPS: {gps.error}</p> : null}
    <h2>Available Delivery Assignments</h2>
    <p>Company drivers can still see queued requests while unavailable. Claiming requires an online, eligible driver with enough vehicle capacity.
      Company drivers can Reject or Reroute unclaimed requests for other drivers. Both actions remove the request from your list
      without cancelling or refunding it; it stays queued if nobody is available. Reject also flags it for Admin review without pausing delivery.</p>
    {offers.length ? offers.map((offer) => <article key={offer._id} className="order-card">
      <h3>{offer.store?.name || 'Store'} - #{offer._id}</h3>
      <p>{offer.store?.address} | {offer.requiredVehicle} | {formatCurrency(offer.deliveryFee)}</p>
      {offer.cartRoute ? <><p>{offer.storeDispatchBatch ? 'Accept this store delivery batch: collect every ready package before starting drop-offs. The fee is the sum of saved package fees.' :
        'Accept this complete customer cart: all pickup stores and drop-off addresses. Fee shown is for the entire cart.'}</p>
        <ol>{offer.cartRoute.stops.map((stop) => <li key={stop.key}>{stop.type === 'pickup' ? 'Pickup' : 'Drop-off'}: {stop.name}</li>)}</ol></> : null}
      <p>Drop-off: {addressText(offer.dropoffAddress)}</p>
      {!offer.dropoffAddress ? <p>Delivery area: {[offer.dropZone?.city, offer.dropZone?.zip].filter(Boolean).join(', ') || 'Address on dispatch'}</p> : null}
      {offer.customerPhone || offer.customer?.phone || offer.dropoffAddress?.phone ? <p>Customer phone: <a
        href={`tel:${String(offer.customerPhone || offer.customer?.phone || offer.dropoffAddress?.phone).replace(/[^\d+]/g, '')}`}>
        {offer.customerPhone || offer.customer?.phone || offer.dropoffAddress?.phone}</a></p> : null}
      <p>{offer.itemCount ?? offer.items?.length ?? 0} item(s)</p>
      {(offer.items || []).map((item, index) => <p key={index}>{item.quantity} x {item.name}</p>)}
      <DeliveryWindow value={offer} />
      {offer.upcoming ? <p role="status">Upcoming scheduled delivery. Claiming opens when every package's delivery window starts.</p> :
        offer.canClaim === false ? <p role="status">Queued until you are online with an eligible vehicle and enough capacity. Refresh after updating your availability.</p> : null}
      <button disabled={busy || offer.canClaim === false} className="solid-button" onClick={() => act(offer._id, offer.sharedAssignment ? 'claim' : 'company-claim')}>Claim delivery</button>
      {offer.canRespond !== false ? <><button disabled={busy} className="ghost-button" onClick={() => {
        if (window.confirm('Return this request for other drivers to claim? It leaves your list and stays queued if nobody is available.')) act(offer._id, 'company-reroute')
      }}>Reroute offer</button>
      <button disabled={busy} className="ghost-button" onClick={() => {
        if (window.confirm('Reject this delivery for yourself and flag it for Admin review without pausing delivery? It remains available to other drivers. The order and payment are not cancelled or refunded.')) act(offer._id, 'company-reject')
      }}>Reject delivery</button></> : null}
    </article>) : <p>No offers. The server controls eligibility, assignment and vehicle compatibility.</p>}
    <h2>Your Route ({queue.length})</h2>
    {routeStops.length ? <section className="order-card" aria-label="Combined delivery stop plan">
      <h3>Combined accepted cart route</h3>
      <p>Complete all pickups for each customer cart before any of its drop-offs. A store visit can collect products for several accepted carts.
        This operational plan does not change customer delivery prices.</p>
      <ol>{routeStops.map((stop) => <li key={stop.key}>{stop.type === 'pickup' ? 'Pickup' : 'Drop-off'}: {stop.name} ({stop.orderIds.length} store order(s))
        <button className="ghost-button" disabled={stop.type === 'dropoff' && stop.requires.length > 0}
          onClick={() => setSelectedId(stop.orderIds[0])}>Show this stop</button>
      </li>)}</ol>
    </section> : null}
    {queue.length ? queue.map((entry) => <article className="order-card" key={entry.orderId}>
      <h3>{entry.store?.name} - #{entry.orderId}</h3>
      <p>Batch: {entry.queueBatchId || 'Individual'} | Sequence: {entry.queueSequence} | {entry.deliveryStatus}</p>
      <p>Pickup: {entry.store?.address}</p>
      <p>Drop-off: {entry.address ? addressText(entry.address) : `${entry.dropZone?.city || 'Delivery area'} (exact address unlocks after pickup)`}</p>
      {entry.customer?.phone ? <p>Recipient: {entry.customer.name} - <a href={`tel:${entry.customer.phone.replace(/[^\d+]/g, '')}`}>{entry.customer.phone}</a></p> : null}
      <DeliveryWindow value={entry} />
      {entry.cartRouteVersion === 1 && !entry.dropoffReady ? <p>Complete all pickups for this customer cart before any drop-off.
        Remaining pickup orders: {entry.pendingPickupOrderIds?.length || 0}.</p> : null}
      {(entry.items || []).map((item, index) => <p key={index}>{item.quantity} x {item.name}</p>)}
      {companyDriver && entry.canRerouteBeforePickup ? <div className="action-row">
        <button className="ghost-button" disabled={busy} onClick={() => {
          if (window.confirm('Release this entire delivery to another driver before pickup? Payments and fees stay unchanged.')) act(entry.orderId, 'company-reroute')
        }}>Reroute accepted delivery</button>
        <button className="danger-button" disabled={busy} onClick={() => {
          if (window.confirm('Reject this accepted delivery before pickup? The whole batch is released and flagged for Admin review; payment stays unchanged.')) act(entry.orderId, 'company-reject')
        }}>Reject accepted delivery</button>
      </div> : null}
      <button className="ghost-button" disabled={entry.deliveryStatus === 'Picked Up' && entry.dropoffReady === false} onClick={() => {
        if (selectedId !== entry.orderId) {
          routeTiming.current.next = Math.min(routeTiming.current.next, Date.now() + 10000)
          setSelectedId(entry.orderId)
        }
      }}>Show current leg on Google Maps</button>
      <button disabled={busy || (entry.deliveryStatus === 'Picked Up' && entry.dropoffReady === false)} className="solid-button" onClick={() => {
        const status = entry.deliveryStatus === 'Picked Up' ? 'Delivered' : 'Picked Up'
        if (window.confirm(status === 'Picked Up' ? 'Confirm the goods have been picked up from this store?' : 'Confirm this delivery was handed to the recipient?')) {
          act(entry.orderId, '', { deliveryStatus: status })
        }
      }}>{entry.deliveryStatus === 'Picked Up' ? 'Confirm drop-off / delivered' : 'Confirm picked up'}</button>
    </article>) : <p>No active deliveries.</p>}
    </article>
    {selected ? <article className="panel" ref={routePanel}><h2>{stage === 'Picked Up' ? 'Drop-off' : 'Pickup'} driving route</h2>
      <p>Route starts at your live GPS position{freshLocation ? ` (${freshLocation.latitude.toFixed(5)}, ${freshLocation.longitude.toFixed(5)})` : ' (not available)'}.</p>
      <p>Route ends at {stage === 'Picked Up' ? `the recipient: ${addressText(selected.address)}` :
        `the assigned pickup store: ${selected.store?.name} - ${selected.store?.address}`}.</p>
      <p>Pickup selection is based on eligible stock near the customer's delivery address, not the driver's GPS location. Store ID: {selected.store?.id}</p>
      {routeError ? <p role="alert">{routeError}</p> : null}
      {shownRoute ? <p>{shownRoute.distance.toFixed(2)} km | {Math.ceil(shownRoute.duration)} minutes (Google route estimate)</p> : null}
      {dropoffBlocked ? <p role="status">Complete all pickups for this customer cart before opening drop-off directions.</p> :
        <DeliveryMap pickup={selected.store?.location} dropoff={stage === 'Picked Up' ? { coordinates: selected.address?.coordinates } : null}
          driver={freshLocation} coordinates={shownRoute?.coordinates} requireDriverOrigin />}
      <p className="section-note">Google road routes refresh at most once per minute. No straight-line route is substituted when Google fails.
        Browser GPS requires permission and HTTPS (or localhost); background tracking is not guaranteed.</p>
    </article> : null}
  </section>
}
