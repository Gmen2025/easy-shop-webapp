import { useEffect, useState } from 'react'
import { apiRequest } from '../api/client'
import { addressText, latLng } from '../utils/delivery'
import DeliveryMap from './DeliveryMap'

export default function OrderTracking({ order }) {
  const id = order._id || order.id
  const [tracking, setTracking] = useState(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let active = true
    let pending = false
    async function load() {
      if (pending) return
      pending = true
      try {
        const result = await apiRequest(`/orders/${encodeURIComponent(id)}/tracking`)
        if (result?.success !== true) throw new Error('The server did not confirm tracking information.')
        if (active) { setTracking(result); setError('') }
      } catch (failure) {
        if (active) setError(failure.message || 'Unable to load tracking information.')
      } finally { pending = false }
    }
    void load()
    const timer = setInterval(load, 15000)
    return () => { active = false; clearInterval(timer) }
  }, [id, revision])

  const dropoff = (order.checkoutGroup || order.customerLocationSource === 'shipping-address') && latLng(order.customerLocation)
    ? order.customerLocation : tracking?.dropoff
  const address = addressText(tracking?.dropoff) || addressText({
    address1: order.shippingAddress1, address2: order.shippingAddress2,
    city: order.city, zip: order.zip, country: order.country,
  })
  const destination = tracking?.deliveryStatus === 'Picked Up' ? dropoff : tracking?.pickup

  return <section className="order-card">
    <h3>Delivery tracking</h3>
    {error ? <div role="alert">{error} <button type="button" onClick={() => setRevision((value) => value + 1)}>Retry</button></div> : null}
    {tracking ? <>
      <p>Status: {tracking.deliveryStatus || tracking.status || 'Pending'} | Dispatch: {tracking.dispatchStatus || 'Unavailable'}</p>
      <p>Driver: {tracking.driver?.name || 'Waiting for assignment'}</p>
      {tracking.pickup?.name ? <p>Pickup: {tracking.pickup.name}{tracking.pickup.address ? ` - ${tracking.pickup.address}` : ''}</p> : null}
      {address ? <p>Drop-off: {address}</p> : null}
      {tracking.driverLocation ? <p>Last GPS update: {tracking.driverLocation.recordedAt ?
        new Date(tracking.driverLocation.recordedAt).toLocaleString() : 'Timestamp unavailable; location may be stale'}</p> : <p>Driver location unavailable.</p>}
      <DeliveryMap pickup={tracking.pickup} dropoff={tracking.deliveryStatus === 'Picked Up' ? dropoff : null}
        driver={tracking.driverLocation} requireDriverOrigin disableRoute={tracking.deliveryStatus === 'Delivered'}
        missingDriverMessage="The driver's location is not available yet." tracking />
      {tracking.driverLocation && !latLng(destination) ? <p>Driver route destination is not available yet.</p> : null}
      <p className="section-note">Tracking refreshes every 15 seconds. Locations may be stale; no arrival time is guaranteed.</p>
    </> : !error ? <p role="status">Loading tracking...</p> : null}
  </section>
}
