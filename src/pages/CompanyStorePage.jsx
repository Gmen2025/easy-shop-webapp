import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiRequest } from '../api/client'
import CompanyNavigation, { CompanyMetrics, CompanyPeriods } from '../components/CompanyNavigation'
import DeliveryWindow from '../components/DeliveryWindow'
import ProductImage from '../components/ProductImage'
import useCompanyResource, { useCompanyAction } from '../features/company/useCompanyResource'
import { requireList, validateCompanyDashboard } from '../utils/company'
import { formatCurrency } from '../utils/format'

const dashboardResponse = (data) => validateCompanyDashboard(data, 'store')
const productsResponse = (data) => requireList(data?.products, 'fulfillment products')
const orderStatus = { 1: 'Pending', 2: 'Processing', 3: 'Delivered', 4: 'Cancelled' }
const money = (value) => Number.isFinite(value) ? formatCurrency(value) : 'Unavailable'

export default function CompanyStorePage() {
  const { orderId } = useParams()
  const analytics = useCompanyResource('/stores/me/dashboard', dashboardResponse)
  const products = useCompanyResource('/products/company/my-products', productsResponse)
  const action = useCompanyAction()
  const [period, setPeriod] = useState('daily')
  const dashboard = analytics.data
  const summary = dashboard?.periods[period]
  const orders = dashboard ? [...dashboard.activeOrders, ...dashboard.recentOrders.filter((order) =>
    !dashboard.activeOrders.some((active) => active._id === order._id))] : []
  const order = orders.find((entry) => String(entry._id || entry.orderId) === orderId)
  const respond = (id, decision) => action.run(async () => {
    await apiRequest(`/products/${encodeURIComponent(id)}/company-${decision}`, { method: 'PUT', body: '{}' })
    await Promise.all([analytics.reload(), products.reload()])
  }, decision === 'ready' ? 'Product marked ready.' : 'Product rejected.')

  return <section className="page-stack company-console company-store">
    <CompanyNavigation />
    <header className="panel company-heading"><div><p className="company-eyebrow">Company Fulfillment</p>
      <h1>{orderId ? 'Order products' : 'Business overview'}</h1>
      <p>{dashboard?.store?.name || 'Store Owner'}</p></div>
      <button className="ghost-button" disabled={analytics.loading || products.loading || action.busy}
        onClick={() => action.run(() => Promise.all([analytics.reload(), products.reload()]))}>Refresh data</button>
    </header>
    {[analytics.error, products.error, action.error].filter(Boolean).map((error, index) => <p className="form-error" role="alert" key={index}>{error}</p>)}
    {action.notice ? <p role="status">{action.notice}</p> : null}
    {analytics.loading && !dashboard ? <p role="status">Loading store analytics...</p> : null}
    {orderId ? <>
      <Link to="/store-owner">Back to business overview</Link>
      {order ? <StoreOrderDetails order={order} storeName={dashboard.store.name} /> :
        !analytics.loading && !analytics.error ? <p role="alert">Order details unavailable. Refresh the overview and select the order again.</p> : null}
    </> : <>
      <article className="panel">
        <p className="company-eyebrow">Store performance</p><h2>Business overview</h2>
        <CompanyPeriods value={period} onChange={setPeriod} />
        {summary ? <>
          <div className="company-sales"><div>Gross sales<strong>{money(summary.sales)}</strong></div>
            <div>Company earnings<strong>{money(summary.earnings)}</strong></div></div>
          <CompanyMetrics items={[
            ['Orders', summary.orders], ['Completed', summary.completedOrders], ['Units sold', summary.unitsSold],
            ['Avg. order', money(summary.averageOrder)], ['Reviews', summary.reviews], ['Avg. rating', summary.averageRating.toFixed(1)],
          ]} />
        </> : null}
      </article>
      {dashboard ? <>
        <article className="panel"><h2>Products & inventory</h2><CompanyMetrics items={[
          ['Products', dashboard.products.total], ['Approved', dashboard.products.approved], ['Pending', dashboard.products.pending],
          ['Units in stock', dashboard.inventory.unitsInStock], ['Low stock', dashboard.inventory.lowStock],
          ['Out of stock', dashboard.inventory.outOfStock], ['Inventory value', money(dashboard.inventory.value)],
        ]} /></article>
        <article className="panel"><h2>Earnings & operations</h2><CompanyMetrics items={[
          ['Available balance', money(dashboard.payouts.available)], ['Paid out', money(dashboard.payouts.paidOut)],
          ['Pending payout', money(dashboard.payouts.pending)], ['Pending orders', dashboard.orders.pending],
          ['Ready fulfillments', dashboard.products.readyFulfillments],
        ]} /></article>
        <article className="panel"><h2>Active & recent orders</h2>
          {orders.length ? orders.map((entry) => <Link className="company-order-row" key={entry._id || entry.orderId}
            to={`/store-owner/orders/${encodeURIComponent(entry._id || entry.orderId)}`}>
            <div><strong>Order #{String(entry._id || entry.orderId).slice(-6).toUpperCase()}</strong>
              <p>{entry.units ?? entry.itemCount ?? 'Unavailable'} item(s) | {entry.deliveryStatus || orderStatus[entry.status] || entry.status}</p>
              <DeliveryWindow value={entry} /><span>View products</span></div>
            <strong>{money(entry.sales ?? entry.totalPrice)}</strong>
          </Link>) : <p>No recent order details are available.</p>}
        </article>
      </> : null}
      <article className="panel"><h2>Products needing fulfillment</h2>
        {products.loading && !products.data ? <p role="status">Loading products...</p> : null}
        {products.data?.length === 0 ? <p>No products need fulfillment.</p> : null}
        <div className="company-card-grid">{products.data?.map((product) => <article className="order-card" key={product._id}>
          <h3>{product.name}</h3><p>{product.category?.name || 'Uncategorized'}</p><p>Price: {money(product.price)}</p>
          <div className="action-row"><button className="solid-button" disabled={action.busy || products.loading} onClick={() => respond(product._id, 'ready')}>Mark Ready</button>
            <button className="danger-button" disabled={action.busy || products.loading} onClick={() => {
              if (window.confirm('Reject this product fulfillment?')) respond(product._id, 'reject')
            }}>Reject</button></div>
        </article>)}</div>
      </article>
    </>}
  </section>
}

function StoreOrderDetails({ order, storeName }) {
  return <article className="panel">
    <h2>Order #{String(order._id || order.orderId).slice(-6).toUpperCase()}</h2>
    <p>Order ID: {order._id || order.orderId}</p><p>Store: {storeName}</p>
    {order.assignedStore ? <p>Assigned store: {order.assignedStore.name} | {order.assignedStore.address} | Store ID: {order.assignedStore.storeId}</p> : null}
    <p>Order status: {orderStatus[order.status] || order.status || 'Unavailable'} | Delivery: {order.deliveryStatus || 'Unavailable'}</p>
    <p>Ordered: {order.dateOrdered ? new Date(order.dateOrdered).toLocaleString() : 'Unavailable'}</p>
    {order.requiredVehicle ? <p>Delivery vehicle: {order.requiredVehicle}</p> : null}
    {order.checkoutGroup ? <p>Combined checkout: {order.checkoutGroup}</p> : null}
    <DeliveryWindow value={order} />
    {order.internationalShipping ? <p>International export: deliver to the US consolidation hub ({order.internationalShipping.hub?.address1}, {order.internationalShipping.hub?.city}).
      Admin manages onward shipment. US delivery completion is not final-recipient delivery.</p> : null}
    <h3>Products for your store</h3><p>Assigned orders show all products. Mixed-store fulfillments show only your store&apos;s products.</p>
    {order.orderItems?.length ? order.orderItems.map((item, index) => <div className="order-card" key={item._id || index}>
      <ProductImage product={item.product || {}} /><h4>{item.product?.name || 'Product no longer available'}</h4>
      <p>Quantity: {item.quantity ?? 'Unavailable'} | Unit price: {money(item.unitPrice ?? item.product?.price)}</p>
      <p>Line total: {money(Number.isFinite(item.unitPrice ?? item.product?.price) && Number.isFinite(item.quantity)
        ? (item.unitPrice ?? item.product.price) * item.quantity : null)}</p>
    </div>) : <p>No product details available.</p>}
    <h3>Order summary</h3><CompanyMetrics items={[
      ['Store units', order.units ?? 'Unavailable'], ['Store product total', money(order.sales)],
      ['Whole-order delivery fee', money(order.deliveryFee)], ['Whole-order total', money(order.totalPrice)],
      ...(order.internationalShipping ? [['Allocated international shipping (not product sales)', money(order.internationalShippingFee)]] : []),
    ]} /><p>Refresh for updated details. New inventory-managed orders retain purchase prices; older orders may use current catalog prices.</p>
  </article>
}
