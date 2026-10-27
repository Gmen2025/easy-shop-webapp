import { useEffect, useState } from 'react'
import { deliveryRequest } from '../api/delivery'
import { apiRequest } from '../api/client'
import { Link } from 'react-router-dom'
import AdminNavigation from '../components/AdminNavigation'
import CompanyNavigation from '../components/CompanyNavigation'
import StoreLogo from '../components/StoreLogo'
import DeliveryWindow from '../components/DeliveryWindow'
import useCompanyResource, { useCompanyAction } from '../features/company/useCompanyResource'
import { assignmentSeconds, requireList } from '../utils/company'
import { formatCurrency } from '../utils/format'

const assignmentsResponse = (data) => requireList(data, 'store assignments')

export default function StoreAssignmentsPage({ admin = false } = {}) {
  const scope = admin ? 'admin' : 'me'
  const assignments = useCompanyResource(`/stores/${scope}/assignments`, assignmentsResponse, 15000)
  const action = useCompanyAction()
  const [now, setNow] = useState(Date.now)
  const [selectedIds, setSelectedIds] = useState([])
  const [driverIds, setDriverIds] = useState({})
  const [preparationVehicles, setPreparationVehicles] = useState({})
  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(clock)
  }, [])
  const respond = (order, decision) => action.run(async () => {
    if (decision === 'delete') await apiRequest(`/orders/${encodeURIComponent(order._id)}`, { method: 'DELETE' })
    else if (decision === 'driver-reroute' || decision === 'driver-assign') {
      await deliveryRequest(`${scope}/assignments/${encodeURIComponent(order._id)}/drivers/${decision === 'driver-assign' ? 'assign' : 'reroute'}`, {
        method: 'POST', ...(decision === 'driver-assign' ? { data: { driverId: driverIds[order._id]?.trim() } } : {}),
      })
    }
    else await deliveryRequest(`${scope}/assignments/${encodeURIComponent(order._id)}/${decision}`, { method: 'POST',
      ...(decision === 'enable-preparation' ? { data: { vehicle: preparationVehicles[order._id] } } : {}) })
    setSelectedIds((current) => decision === 'ready'
      ? current.includes(order._id) ? current : [...current, order._id]
      : current.filter((key) => key !== order._id))
    await assignments.reload()
  }, decision === 'ready' ? 'Package ready and selected. Use Dispatch selected to send it to drivers.' :
    decision === 'accept' ? 'Order claimed. Prepare the package, then mark it ready to select it for dispatch.' : 'Assignment response saved.')
  const selectable = (order) => order.storeRouteVersion === 1 && order.fulfillmentStatus === 'accepted' &&
    order.storeReadyAt && !order.storeDispatchBatch && !order.driver
  const selected = (assignments.data || []).filter((order) => selectedIds.includes(order._id))
  const dispatchSelected = () => action.run(async () => {
    await deliveryRequest(`${scope}/dispatch-batches`, { method: 'POST', data: { orderIds: selectedIds } })
    setSelectedIds([])
    await assignments.reload()
  }, 'Dispatch queued for one compatible driver. Packages stay queued if no driver is available.')
  return <section className="page-stack company-console company-store">{admin ? <AdminNavigation /> : <CompanyNavigation />}
    <article className="panel"><h1>{admin ? 'Admin store assignments & rejections' : 'Store assignments'}</h1>
      <p>Timed assignments reroute automatically. Default-store fallback requests stay queued even while offline and have no expiry.
        Open your store and ensure matching stock and prices before claiming. Claim the order, prepare its package, then mark it ready.
        Marking ready automatically selects it for dispatch. Dispatch selected sends ready packages from one store using the same vehicle. Single-package dispatch is also allowed.
        Claiming and rerouting need no Admin review. Rerouting offers another eligible store a chance to accept; only rejected fallback requests wait for Admin review.</p>
      <p>Driver routing tries nearby available drivers, then the nearest available company driver, then an eligible offline company driver.
        Dispatched batches stay together. You can reroute a batch to other drivers before any package is picked up.</p>
      {admin ? <p>Admin can override ownership and online status to claim, prepare, dispatch or assign an approved compatible driver.
        Stock, capacity, payment and pickup safeguards still apply. Cancel and reconcile any required refund before deleting paid orders.</p> : null}
      <button className="solid-button" disabled={action.busy || assignments.loading || Boolean(assignments.error) ||
        !selectedIds.length || selected.length !== selectedIds.length || selected.some((order) => !selectable(order))}
        onClick={dispatchSelected}>Dispatch selected ({selectedIds.length})</button>
      {!selectedIds.length ? <p>Nothing selected. Claim an order, prepare it, then click Mark package ready to select it automatically. Already-ready packages can be selected below.</p> : null}
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
      const rejected = order.adminReviewRequired === 'store'
      const driverRejections = (order.companyDriverResponses || []).filter((response) => response.status === 'rejected' && response.action !== 'reroute')
      const driverManageable = (order.storeDispatchBatch || !order.storeRouteVersion && (!order.inventoryManaged || order.fulfillmentStatus === 'accepted')) &&
        ['Pending', 'Driver Assigned'].includes(order.deliveryStatus) &&
        !['completed', 'cancelled', 'payment_pending'].includes(order.fulfillmentStatus) && !rejected && !order.fallbackStore
      const active = !['completed', 'cancelled', 'payment_pending'].includes(order.fulfillmentStatus) &&
        !order.driver && !order.storeDispatchBatch
      return <article className="panel" key={order._id}>
        <StoreLogo name={store?.name} logo={store?.logo} /><h2>Order #{order._id.slice(-6).toUpperCase()}</h2>
        <p>{store?.name} | {store?.address}</p><p>Store ID: {store?.storeId || store?._id}</p>
        {order.checkoutGroup ? <p>Combined checkout: {order.checkoutGroup}</p> : null}
        {order.requiredVehicle ? <p>Delivery vehicle: {order.requiredVehicle}</p> : null}
        <p>Deliver to: {[order.shippingAddress1, order.city, order.zip].filter(Boolean).join(', ')}</p>
        <DeliveryWindow value={order} />
        {order.driver ? <p>Assigned driver: {String(order.driver)}</p> : order.companyOfferDriver ? <p>Company-driver offer: {String(order.companyOfferDriver)} (persists offline)</p> : null}
        {driverRejections.length ? <p>Driver rejection - Admin review ({driverRejections.length}). Payment is unchanged; rejection does not block delivery.</p> : null}
        {admin ? driverRejections.map((response, index) => <p key={response._id || index}>
          Rejected by driver {String(response.driver)}{response.respondedAt ? ` at ${new Date(response.respondedAt).toLocaleString()}` : ''}
        </p>) : null}
        {(order.orderItems || []).map((line, index) => <p key={line._id || index}>
          {line.quantity} x {line.product?.name || 'Product'} - {Number.isFinite(line.unitPrice ?? line.product?.price) ? formatCurrency(line.unitPrice ?? line.product.price) : 'Price unavailable'}
        </p>)}
        <p>Products: {Number.isFinite(order.itemsSubtotal) ? formatCurrency(order.itemsSubtotal) : 'Unavailable'}</p>
        <p>{rejected ? `Rejected - Admin review | ${order.fulfillmentStatus}` : fallback ? 'Default-store fallback - awaiting a decision (no expiry)' : order.fulfillmentStatus === 'accepted'
          ? order.storeDispatchBatch ? 'Dispatched to drivers' : order.storeReadyAt ? 'Ready for dispatch' : 'Claimed - prepare the package, then click Mark package ready' : order.fulfillmentStatus === 'pending' ? `Respond within ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` :
            `Delivery status: ${order.deliveryStatus} | ${order.fulfillmentStatus || order.status}`}</p>
        {admin ? <div className="action-row">
          {active ? <>
            {order.fulfillmentStatus !== 'accepted' ? <button className="solid-button" disabled={action.busy || assignments.loading}
              onClick={() => respond(order, 'accept')}>Claim for assigned/default store</button> : null}
            <button className="ghost-button" disabled={action.busy || assignments.loading} onClick={() => respond(order, 'reroute')}>Admin reroute</button>
          </> : null}
          <button className="danger-button" disabled={action.busy || assignments.loading} onClick={() => {
            if (window.confirm('Delete order? Cancel through its checkout and reconcile any refund first. Paid orders cannot be silently deleted.')) respond(order, 'delete')
          }}>{rejected ? 'Delete rejected order' : 'Delete order'}</button>
          {order.checkoutGroup ? <Link to={`/admin/delivery-payments?selected=${encodeURIComponent(order.checkoutGroup)}`}>Payment, cancellation & refunds</Link> : null}
        </div> : null}
        {driverManageable ? <div className="action-row">
          <button className="ghost-button" disabled={action.busy || assignments.loading} onClick={() => {
            if (window.confirm('Reroute the entire delivery batch to another eligible driver before pickup? Saved fees and payments remain unchanged.')) respond(order, 'driver-reroute')
          }}>Reroute to another driver</button>
          {admin ? <>
            <label>Driver ID (approved, compatible vehicle)
              <input aria-label={`Driver ID for ${order._id}`} value={driverIds[order._id] || ''}
                onChange={(event) => setDriverIds((current) => ({ ...current, [order._id]: event.target.value }))} />
            </label>
            <button className="solid-button" disabled={action.busy || assignments.loading || !driverIds[order._id]?.trim()} onClick={() => {
              if (window.confirm('Assign this entire delivery to the selected driver, overriding online status and ownership? Vehicle, capacity and pickup safeguards remain enforced.')) respond(order, 'driver-assign')
            }}>Admin assign / dispatch to driver</button>
          </> : null}
        </div> : null}
        {!order.storeRouteVersion && !fallback && order.fulfillmentStatus === 'accepted' && active ? <div className="action-row">
          <p>This order uses the older delivery workflow, which hides preparation controls. Enable store preparation first; saved fees and payments will not change.
            For an older cart, all active packages must be claimed and free of driver assignments, and upgrade together.</p>
          {!order.requiredVehicle ? <label>Delivery vehicle for packages without a saved vehicle (unknown-size packages dispatch singly)
            <select aria-label={`Preparation vehicle for ${order._id}`} value={preparationVehicles[order._id] || ''}
              onChange={(event) => setPreparationVehicles((current) => ({ ...current, [order._id]: event.target.value }))}>
              <option value="">Choose vehicle</option>
              {['motorcycle', 'car', 'van', 'truck'].map((vehicle) => <option key={vehicle} value={vehicle}>{vehicle}</option>)}
            </select>
          </label> : null}
          <button className="solid-button" disabled={action.busy || assignments.loading || !order.requiredVehicle && !preparationVehicles[order._id]} onClick={() => {
            if (window.confirm('Enable store preparation for all active packages in this older cart? Stores will prepare and dispatch separately. Saved fees, payment records and stock reservations stay unchanged.')) respond(order, 'enable-preparation')
          }}>Enable store preparation</button>
        </div> : null}
        {order.storeRouteVersion === 1 && !fallback && order.fulfillmentStatus === 'accepted' ? <div className="action-row">
          {order.storeDispatchBatch ? <p>Dispatched batch: {order.storeDispatchBatch} | {order.deliveryStatus}.
            {!order.driver ? ' Awaiting a compatible driver; remains queued.' : ''}</p> : order.storeReadyAt ? <label>
            <input type="checkbox" checked={selectedIds.includes(order._id)} disabled={action.busy || assignments.loading}
              onChange={() => setSelectedIds((current) => current.includes(order._id) ? current.filter((key) => key !== order._id) : [...current, order._id])} />
            Ready - select for dispatch
          </label> : <button className="solid-button" disabled={action.busy || assignments.loading} onClick={() => respond(order, 'ready')}>Mark package ready</button>}
        </div> : null}
        {!admin && !fallback && order.fulfillmentStatus === 'accepted' && active ? <button className="ghost-button"
          disabled={action.busy || assignments.loading} onClick={() => {
            if (window.confirm('Release this claimed request to another eligible store? No Admin approval is needed.')) respond(order, 'reroute')
          }}>Reroute</button> : null}
        {!admin && (fallback || order.fulfillmentStatus === 'pending') ? <div className="action-row">
          <button className="solid-button" disabled={action.busy || assignments.loading || Boolean(assignments.error) || (!fallback && seconds === 0)} onClick={() => respond(order, 'accept')}>{fallback ? 'Claim order' : 'Accept order'}</button>
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
