import { useEffect, useState } from 'react'
import { deliveryRequest } from '../api/delivery'
import CompanyNavigation from '../components/CompanyNavigation'
import StoreLogo from '../components/StoreLogo'
import DeliveryWindow from '../components/DeliveryWindow'
import useCompanyResource, { useCompanyAction } from '../features/company/useCompanyResource'
import { assignmentSeconds, requireList } from '../utils/company'
import { formatCurrency } from '../utils/format'

const assignmentsResponse = (data) => requireList(data, 'store assignments')

export default function StoreAssignmentsPage() {
  const assignments = useCompanyResource('/stores/me/assignments', assignmentsResponse, 15000)
  const action = useCompanyAction()
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(clock)
  }, [])
  const respond = (order, decision) => action.run(async () => {
    await deliveryRequest(`me/assignments/${encodeURIComponent(order._id)}/${decision}`, { method: 'POST' })
    await assignments.reload()
  }, 'Assignment response saved.')
  return <section className="page-stack company-console company-store"><CompanyNavigation />
    <article className="panel"><h1>Store assignments</h1>
      <p>Timed assignments reroute automatically. Default-store fallback requests have no expiry. Open your store and ensure matching stock and prices before claiming.</p>
      <button className="ghost-button" disabled={action.busy || assignments.loading} onClick={() => action.run(assignments.reload)}>Refresh assignments</button>
      {assignments.loading && !assignments.data ? <p role="status">Loading assignments...</p> : null}
      {assignments.error || action.error ? <p role="alert">{assignments.error || action.error}</p> : null}
      {action.notice ? <p role="status">{action.notice}</p> : null}
    </article>
    {assignments.data?.length === 0 ? <p>No active assignments.</p> : null}
    {assignments.data?.map((order) => {
      const fallback = Boolean(order.fallbackStore)
      const store = order.fallbackStore || order.assignedStoreSnapshot
      const seconds = assignmentSeconds(order, now)
      return <article className="panel" key={order._id}>
        <StoreLogo name={store?.name} logo={store?.logo} /><h2>Order #{order._id.slice(-6).toUpperCase()}</h2>
        <p>{store?.name} | {store?.address}</p><p>Store ID: {store?.storeId || store?._id}</p>
        {order.checkoutGroup ? <p>Combined checkout: {order.checkoutGroup}</p> : null}
        {order.requiredVehicle ? <p>Delivery vehicle: {order.requiredVehicle}</p> : null}
        <p>Deliver to: {[order.shippingAddress1, order.city, order.zip].filter(Boolean).join(', ')}</p>
        <DeliveryWindow value={order} />
        {(order.orderItems || []).map((line, index) => <p key={line._id || index}>
          {line.quantity} x {line.product?.name || 'Product'} - {Number.isFinite(line.unitPrice ?? line.product?.price) ? formatCurrency(line.unitPrice ?? line.product.price) : 'Price unavailable'}
        </p>)}
        <p>Products: {Number.isFinite(order.itemsSubtotal) ? formatCurrency(order.itemsSubtotal) : 'Unavailable'}</p>
        <p>{fallback ? 'Default-store fallback - awaiting a decision (no expiry)' : order.fulfillmentStatus === 'accepted'
          ? 'Accepted - prepare for pickup' : `Respond within ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}</p>
        {fallback || order.fulfillmentStatus === 'pending' ? <div className="action-row">
          <button className="solid-button" disabled={action.busy || assignments.loading || Boolean(assignments.error) || (!fallback && seconds === 0)} onClick={() => respond(order, 'accept')}>{fallback ? 'Claim & prepare' : 'Accept & prepare'}</button>
          {fallback ? <button className="ghost-button" disabled={action.busy || assignments.loading} onClick={() => {
            if (window.confirm('Reroute this assignment to another eligible store?')) respond(order, 'reroute')
          }}>Reroute</button> : null}
          <button className="danger-button" disabled={action.busy || assignments.loading} onClick={() => {
            if (window.confirm(fallback ? 'Reject for Admin review? This does not cancel payment or issue a refund.' : 'Reject assignment? The entire order will move to another eligible store.')) respond(order, 'reject')
          }}>Reject</button>
        </div> : null}
      </article>
    })}
  </section>
}
