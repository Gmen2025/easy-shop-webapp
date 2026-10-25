import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { apiRequest } from '../api/client'
import { deliveryRequest } from '../api/delivery'
import { formatCurrency } from '../utils/format'
import DeliveryMap from '../components/DeliveryMap'
import DeliveryWindow from '../components/DeliveryWindow'
import { ExchangeReceipt, InternationalReceipt } from '../components/CheckoutReceipts'
import { money, paymentAmount, SHIPMENT_STAGES } from '../utils/checkoutPayment'

function Tracking({ order }) {
  const [tracking, setTracking] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let current = true
    let pending = false
    async function load() {
      if (pending) return
      pending = true
      try {
        const result = await apiRequest(`/orders/${order._id}/tracking`)
        if (current) { setTracking(result); setError('') }
      } catch (failure) { if (current) setError(failure.message) }
      finally { pending = false }
    }
    load()
    const timer = setInterval(load, 15000)
    return () => { current = false; clearInterval(timer) }
  }, [order._id])
  return <section className="order-card">
    <h3>Live delivery tracking</h3>
    {error ? <p role="alert">{error}</p> : null}
    {tracking ? <>
      <p>{tracking.deliveryStatus} | Dispatch: {tracking.dispatchStatus}</p>
      <p>Driver: {tracking.driver?.name || 'Waiting for assignment'}</p>
      {tracking.driverLocation ? <p>Last GPS update: {tracking.driverLocation.recordedAt ?
        new Date(tracking.driverLocation.recordedAt).toLocaleString() : 'Timestamp unavailable; location may be stale'}</p> : <p>Driver location unavailable.</p>}
      <DeliveryMap pickup={tracking.pickup} dropoff={order.customerLocation} driver={tracking.driverLocation} />
      <p className="section-note">Status refreshes every 15 seconds. Only assigned-driver routes are calculated; marker positions are not a customer ETA.</p>
    </> : <p>Loading tracking...</p>}
  </section>
}

export default function DeliveryCheckoutsPage({ admin = false }) {
  const user = useSelector((state) => state.auth.user)
  const [search, setSearch] = useSearchParams()
  const selectedId = search.get('selected')
  const [groups, setGroups] = useState([])
  const [selected, setSelected] = useState(null)
  const [trackId, setTrackId] = useState('')
  const [refundReference, setRefundReference] = useState('')
  const [shipmentForms, setShipmentForms] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const guard = useRef(false)
  const permitted = !admin || user?.isAdmin
  const load = useCallback(async () => {
    if (!permitted) return
    if (selectedId) setSelected(await deliveryRequest(`checkouts/${selectedId}`))
    else {
      setSelected(null)
      setGroups(await deliveryRequest(`checkouts${admin ? '?all=true' : ''}`))
    }
  }, [admin, selectedId, permitted])
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
  async function action(path, data = {}) {
    if (guard.current) return
    guard.current = true
    setBusy(true); setError('')
    try {
      await deliveryRequest(`checkouts/${selectedId}/${path}`, { method: 'POST', data, timeoutMs: 60000 })
      await load()
    } catch (failure) { setError(failure.message) }
    finally { guard.current = false; setBusy(false) }
  }
  if (!permitted) return <p role="alert">Admin access required.</p>
  return <section className="panel delivery-page">
    <div className="panel-header"><h1>{admin ? 'Combined delivery payments' : 'My delivery checkouts'}</h1>
      <Link to={admin ? '/admin' : '/cart'}>{admin ? 'Admin dashboard' : 'Return to cart'}</Link></div>
    {error ? <p role="alert" className="error-text">{error}</p> : null}
    {busy ? <p role="status">Updating delivery...</p> : null}
    <button className="ghost-button" disabled={busy} onClick={() => load().catch((failure) => setError(failure.message))}>Refresh status</button>
    {selectedId ? <button className="ghost-button" onClick={() => { setSearch({}); setTrackId('') }}>All checkouts</button> : null}
    {!selectedId ? groups.length ? groups.map((group) => <article className="order-card" key={group._id}>
      <h2>Checkout #{group._id}</h2><p>{group.status} | {group.paymentMethod} | {group.paymentStatus}</p>
      <p>{formatCurrency(group.totalPrice)} | {group.kind === 'service' ? 'Service payment' : `${group.deliveries.length} deliveries`}</p>
      {group.exchangeRate ? <p>Payment: {money(paymentAmount(group), group.currency)}</p> : null}
      <button className="solid-button" onClick={() => setSearch({ selected: group._id })}>View deliveries</button>
    </article>) : <p>No delivery checkouts yet.</p> : null}
    {selected && selected._id === selectedId ? <>
      <h2>Checkout #{selected._id}</h2><p>{selected.status} | Payment: {selected.paymentStatus}</p>
      <h3>Total: {formatCurrency(selected.totalPrice)}</h3><DeliveryWindow value={selected} />
      <ExchangeReceipt value={selected} />
      <InternationalReceipt group={selected} />
      {selected.kind === 'service' ? <p>Service request #{selected.serviceRequest}. Submitted or paid service funds require support review and a manual refund process before cancellation.</p> : null}
      {['quote', 'awaiting_payment'].includes(selected.status) && !admin ? <Link className="solid-button" to={`/delivery-checkouts/${selectedId}`}>Resume payment / check payment status</Link> : null}
      {admin && selected.paymentMethod === 'bank' ? <article className="order-card">
        <p>{selected.bankAccount?.bankName} - {selected.bankAccount?.accountNumber}</p>
        <p>Sender: {selected.bankSender} | Reference: {selected.bankReference}</p>
        <p>Verify exact funds received: {selected.paymentAmount ?? selected.totalPrice} {selected.currency?.toUpperCase()}</p>
        {['placed', 'bank_review'].includes(selected.status) && selected.paymentStatus === 'pending' ? <button disabled={busy} className="solid-button" onClick={() => {
          if (window.confirm('Have you verified the exact combined total in the actual bank account?')) action('bank-confirm')
        }}>Confirm combined bank payment received</button> : null}
        {selected.status === 'bank_review' ? <button disabled={busy} className="ghost-button" onClick={() => {
          if (window.confirm('Confirm no funds were received. This releases stock. If paid, confirm funds and use a refund instead.')) action('bank-reject', { noFundsReceived: true })
        }}>Reject: no funds received</button> : null}
      </article> : null}
      {admin && selected.international?.shipments.map((shipment) => {
        const next = SHIPMENT_STAGES[SHIPMENT_STAGES.indexOf(shipment.status) + 1]
        const form = shipmentForms[shipment.id] || {}
        return next && selected.status === 'placed' && selected.paymentStatus === 'completed' ? <article key={shipment.id} className="order-card">
          <h3>Advance {shipment.recipient.label}: {shipment.status} to {next}</h3>
          <p>Verify every active pickup reached the US hub and the actual milestone occurred before updating.</p>
          {['carrier', 'trackingNumber', 'note'].map((field) => <label key={field}>
            {field === 'note' ? 'Shipment note / final delivery proof' : field === 'trackingNumber' ? 'Tracking number' : 'Carrier'}
            <input maxLength={300} value={form[field] || ''} onChange={(event) =>
              setShipmentForms((previous) => ({ ...previous, [shipment.id]: { ...previous[shipment.id], [field]: event.target.value } }))} />
          </label>)}
          <button disabled={busy} className="solid-button" onClick={() => {
            if (window.confirm(`Confirm the actual shipment milestone: ${next}? Export requires carrier/tracking; final delivery requires recipient proof.`)) {
              action(`shipments/${encodeURIComponent(shipment.id)}`, { ...form, status: next })
            }
          }}>Mark shipment {next}</button>
        </article> : null
      })}
      {(selected.childOrders || []).map((order) => <article className="order-card" key={order._id}>
        <h3>Delivery #{order._id}</h3>
        <p>Pickup: {order.assignedStoreSnapshot?.name} - {order.assignedStoreSnapshot?.address}</p>
        <p>Drop-off: {[order.shippingAddress1, order.shippingAddress2, order.city, order.zip, order.country].filter(Boolean).join(', ')}</p>
        <p>Recipient phone: {order.phone} | Vehicle: {order.requiredVehicle}</p>
        <p>Store: {order.fulfillmentStatus} | Delivery: {order.deliveryStatus}</p>
        <DeliveryWindow value={order} />
        {(order.orderItems || []).map((line) => <p key={line._id}>{line.quantity} x {line.product?.name || 'Product unavailable'} - {line.unitPrice == null ? 'Price unavailable' : formatCurrency(line.unitPrice)} each</p>)}
        <p>Products: {formatCurrency(order.itemsSubtotal)} | Delivery: {formatCurrency(order.deliveryFee)} | Total: {formatCurrency(order.totalPrice)}</p>
        <ExchangeReceipt value={order} />
        {order.internationalShipping ? <div>
          <p>US-to-Ethiopia shipment: {order.internationalShipping.status} | {order.internationalShipping.carrier} {order.internationalShipping.trackingNumber}</p>
          <p>The US delivery status refers to the consolidation hub, not final delivery in Ethiopia.</p>
          <p>{order.internationalShipping.customsNotice}</p>
        </div> : null}
        {order.deliveryPricingGroup?.storeCount > 1 ? <p>{order.deliveryPricingGroup.storeCount} nearby pickups share a vehicle fee. This delivery shows only its saved share.</p> : null}
        {order.refundStatus ? <p>Refund: {order.refundStatus} {order.refundId || ''}</p> : null}
        {order.refundStatus && order.exchangeRate ? <p>Saved refund amount: {money(paymentAmount(order), order.paymentCurrency || selected.currency)}</p> : null}
        {order.fulfillmentStatus !== 'cancelled' ? <button className="ghost-button" onClick={() => setTrackId(trackId === order._id ? '' : order._id)}>Toggle live tracking</button> : null}
        {selected.status === 'placed' && !['cancelled', 'completed'].includes(order.fulfillmentStatus) && order.deliveryStatus !== 'Delivered' ? <button disabled={busy} className="ghost-button" onClick={() => {
          if (window.confirm('Cancel this delivery only? Refund availability is checked by the server.')) action(`deliveries/${order._id}/cancel`)
        }}>Cancel this delivery</button> : null}
        {admin && ['pending', 'failed'].includes(order.refundStatus) && selected.paymentMethod === 'card' ? <button disabled={busy} className="ghost-button" onClick={() =>
          action(`deliveries/${order._id}/refund`, { retryFailed: order.refundStatus === 'failed' })}>Reconcile / retry refund</button> : null}
        {admin && order.refundStatus === 'pending' && selected.paymentMethod === 'bank' ? <div>
          <label>Actual bank refund reference<input value={refundReference} onChange={(event) => setRefundReference(event.target.value)} /></label>
          <button disabled={busy || !refundReference.trim()} className="ghost-button" onClick={() => {
            if (window.confirm('Record only a refund already sent through the bank.')) action(`deliveries/${order._id}/manual-refund`, { reference: refundReference })
          }}>Record completed bank refund</button>
        </div> : null}
        {trackId === order._id ? <Tracking order={order} /> : null}
      </article>)}
    </> : null}
  </section>
}
