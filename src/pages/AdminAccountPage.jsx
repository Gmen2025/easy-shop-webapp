import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiRequest } from '../api/client'
import { uploadProductImage } from '../api/uploads'
import AdminNavigation from '../components/AdminNavigation'
import { CompanyPeriods } from '../components/CompanyNavigation'
import DeliveryWindow from '../components/DeliveryWindow'
import DriverTripMap from '../components/DriverTripMap'
import useCompanyResource, { useCompanyAction } from '../features/company/useCompanyResource'
import { requireList, inventoryPayload, driverRideFare } from '../utils/company'
import { addressText } from '../utils/delivery'
import { businessPath, validateBusiness } from '../utils/operatorWorkspace'
import FinancePage from './FinancePage'

const request = (path, data) => apiRequest(path, { method: 'POST', body: JSON.stringify(data) })
const label = (key) => key.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase())
const display = (value) => value == null || value === '' ? 'Not provided' : typeof value === 'boolean' ? value ? 'Yes' : 'No' : String(value)
const status = (action) => <>{action.error && <p role="alert">{action.error}</p>}{action.notice && <p role="status">{action.notice}</p>}</>
const notificationCheck = (result) => {
  if (result.notification?.error) throw new Error(`Saved, but notification failed: ${result.notification.error}`)
}
const profileResponse = (data) => validateBusiness(data, 'store', 'profile')
const categoriesResponse = (data) => requireList(data, 'categories')
const catalogResponse = (data) => requireList(data, 'catalog')

export default function AdminAccountPage() {
  const { kind, accountId } = useParams()
  if (!['store', 'driver'].includes(kind)) return <p role="alert">Invalid account type.</p>
  return <AccountWorkspace key={`${kind}:${accountId}`} kind={kind} accountId={accountId} />
}

function AccountWorkspace({ kind, accountId }) {
  const [view, setView] = useState('dashboard')
  const [productRevision, setProductRevision] = useState(0)
  const profile = useCompanyResource(businessPath(kind, accountId, 'profile'), profileResponse)
  const views = [['dashboard', 'Business overview'], ['profile', 'Profile & locations'],
    ...(kind === 'store' ? [['assignments', 'Store assignments'], ['fulfillment', 'Fulfillment products'], ['reviews', 'Reviews']]
      : [['queue', 'Delivery queue'], ['available-deliveries', 'Delivery offers'], ['completed-today', 'Completed today'], ['rides', 'Ride dashboard'], ['wallet', 'Commission wallet']]),
    ['income', 'Products, income & settings'], ['notify', 'Send notification']]
  return <section className="page-stack admin-console">
    <AdminNavigation /><Link to="/admin/income">All stores, owners & drivers</Link>
    <h1>{profile.data?.account.name || (kind === 'store' ? 'Store owner' : 'Driver')}: business dashboard</h1>
    {profile.data && <p>{profile.data.account.isCompanyOwned ? 'AdduGenet-owned' : 'Independent'} | Account holder: {profile.data.owner?.name || 'No linked user'}</p>}
    {profile.error && <p role="alert">{profile.error}</p>}
    <p>Admin inspection: your own sign-in is retained. Delivery, ride and fulfillment actions remain with the operator.</p>
    <nav className="company-navigation" aria-label="Account dashboard sections">{views.map(([key, title]) =>
      <button key={key} aria-pressed={view === key} onClick={() => setView(key)}>{title}</button>)}</nav>
    {view === 'income' ? <>
      {kind === 'store' && <StoreAdditions storeId={accountId} onSaved={() => setProductRevision((value) => value + 1)} />}
      <FinancePage key={productRevision} admin embedded />
    </> : view === 'notify' ? <AccountNotification kind={kind} accountId={accountId} /> :
      <BusinessView key={`${kind}:${accountId}:${view}`} kind={kind} accountId={accountId} view={view} />}
  </section>
}

function BusinessView({ kind, accountId, view }) {
  const validate = useCallback((data) => validateBusiness(data, kind, view), [kind, view])
  const resource = useCompanyResource(businessPath(kind, accountId, view), validate)
  const action = useCompanyAction()
  const [period, setPeriod] = useState('weekly')
  const data = resource.data
  return <article className="panel">
    <button disabled={resource.loading || action.busy} onClick={() => action.run(resource.reload)}>Refresh dashboard</button>
    {resource.loading && <p role="status">Loading account dashboard...</p>}
    {(resource.error || action.error) && <p role="alert">{resource.error || action.error}</p>}
    {data && !resource.error && <>
      {view === 'dashboard' && <>
        <h2>{data.store?.name || 'Driver performance'}</h2><CompanyPeriods value={period} onChange={setPeriod} />
        <p>Gross activity totals; use Income & settings for net allocations and separate payout currencies.</p>
        <Fields values={data.periods[period]} />
        {kind === 'store' ? <>
          <h3>Products</h3><Fields values={data.products} /><h3>Inventory</h3><Fields values={data.inventory} />
          <h3>Orders</h3><Fields values={data.orders} />
          <h3>Active & recent orders</h3><BusinessOrders orders={[...data.activeOrders, ...data.recentOrders.filter((order) => !data.activeOrders.some((active) => active._id === order._id))]} />
        </> : <><h3>Recent deliveries</h3><BusinessOrders orders={data.recentDeliveries} /></>}
      </>}
      {view === 'profile' && <>
        <h2>{data.account.name}</h2><Fields values={data.account} />
        <h3>Account holder</h3>{data.owner ? <Fields values={data.owner} /> : <p>No linked user. Notifications are unavailable until an account is linked.</p>}
        {data.locations.length > 0 && <><h3>Owner locations</h3>{data.locations.map((store) =>
          <p key={store._id}><Link to={`/admin/accounts/store/${store._id}`}>{store.name}</Link> - {store.isCompanyOwned ? 'AdduGenet-owned' : 'Independent'}</p>)}</>}
        {kind === 'store' && <p>Per-store inventory: {data.inventoryEnabled ? 'Enabled' : 'Not migrated'}</p>}
      </>}
      {view === 'assignments' && <BusinessOrders orders={data} />}
      {['queue', 'completed-today', 'available-deliveries'].includes(view) && <>
        {data.driverEligibility && <p>{data.driverEligibility.message}</p>}
        <BusinessOrders orders={data.queue || data.orders} />
        {data.routeStops?.length > 0 && <><h3>Delivery route stops</h3>{data.routeStops.map((stop, index) => <Fields key={index} values={stop} />)}</>}
      </>}
      {view === 'reviews' && <>{data.reviews.length === 0 && <p>No reviews.</p>}{data.reviews.map((review) => <Fields key={review.id} values={review} />)}</>}
      {view === 'fulfillment' && <>{data.products.length === 0 && <p>No legacy product fulfillments. Migrated stores use store assignments.</p>}
        {data.products.map((product) => <Fields key={product._id} values={{ name: product.name, price: product.price, category: product.category?.name, stock: product.countInStock }} />)}</>}
      {view === 'wallet' && <>
        <h2>Commission wallet (not earned income)</h2><Fields values={Object.fromEntries(Object.entries(data).filter(([key]) => !['transactions', 'success'].includes(key)))} />
        <h3>Recent wallet transactions</h3>{!data.transactions.length && <p>No wallet transactions.</p>}{data.transactions.map((transaction) => <Fields key={transaction._id} values={transaction} />)}
      </>}
      {view === 'rides' && <>
        <h2>Driver ride profile & service preferences</h2><Fields values={data.driver} />
        <h3>Active trip</h3>{data.trip ? <>
          <DriverTripMap stops={data.trip.stops.filter((stop) => !stop.completedAt)} driver={data.driver.location} />
          <Fields values={Object.fromEntries(Object.entries(data.trip).filter(([key]) => key !== 'stops'))} />
          {data.trip.stops.map((stop, index) => <div key={index}><p>{index + 1}. {stop.type}: {addressText(stop.address)}</p><Fields values={stop} /></div>)}
        </> : <p>No active trip.</p>}
        <h3>Current offer</h3>{data.offer ? <Fields values={data.offer} /> : <p>No current ride offer.</p>}
        <h3>Passengers</h3>{data.riders.map((rider) => <Fields key={rider._id} values={rider} />)}
        <h3>Ride payments</h3>{!data.payments.length && <p>No recent ride payments.</p>}
        {data.payments.map((ride) => <div className="order-card" key={ride._id}><p>{driverRideFare(ride)}</p><Fields values={ride} /></div>)}
      </>}
    </>}
  </article>
}

function Fields({ values }) {
  return <dl className="admin-data-rows">{Object.entries(values || {}).filter(([key]) => !['__v', 'success'].includes(key)).map(([key, value]) =>
    <div key={key}><dt>{label(key)}</dt><dd>{value && typeof value === 'object'
      ? Array.isArray(value) ? value.length ? value.map((entry, index) => <div key={index}>{entry && typeof entry === 'object' ? <Fields values={entry} /> : display(entry)}</div>) : 'None'
        : <Fields values={value} /> : display(value)}</dd></div>)}</dl>
}

function BusinessOrders({ orders }) {
  return <>{orders.length === 0 && <p>No orders or deliveries.</p>}{orders.map((order) => <article className="order-card" key={order._id || order.orderId}>
    <h3>#{String(order._id || order.orderId).slice(-6)}</h3>
    <p>{display(order.deliveryStatus || order.fulfillmentStatus || order.status)} | {order.storeName || order.store?.name}</p>
    <DeliveryWindow value={order} />
    <Fields values={Object.fromEntries(Object.entries(order).filter(([key]) => !['orderItems', 'products'].includes(key)))} />
    {(order.orderItems || order.products || []).map((item, index) => <p key={item._id || index}>
      {item.quantity ?? item.qty} x {item.product?.name || item.name || 'Removed product'} | Unit price: {display(item.unitPrice ?? item.price ?? item.product?.price)}
    </p>)}
  </article>)}</>
}

function AccountNotification({ kind, accountId }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const action = useCompanyAction()
  return <article className="panel"><h2>Notify this {kind === 'store' ? 'store owner' : 'driver'}</h2>
    <p>Saved in the website/app inbox; mobile push is attempted for registered devices.</p>{status(action)}
    <form onSubmit={(event) => {
      event.preventDefault()
      action.run(async () => {
        const result = await request(`/finance/accounts/${kind}/${accountId}/notifications`, { title, body })
        setTitle(''); setBody('')
        return result
      }, 'Notification saved to this account inbox.')
    }}><fieldset disabled={action.busy}>
      <label>Title<input required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label>Message<textarea required maxLength={2000} value={body} onChange={(event) => setBody(event.target.value)} /></label>
      <button>Send notification</button>
    </fieldset></form>
  </article>
}

function StoreAdditions({ storeId, onSaved }) {
  const profile = useCompanyResource(businessPath('store', storeId, 'profile'), profileResponse)
  const categories = useCompanyResource('/categories', categoriesResponse)
  const catalog = useCompanyResource('/finance/admin/catalog', catalogResponse)
  const action = useCompanyAction()
  const [productId, setProductId] = useState('')
  const [form, setForm] = useState({ name: '', description: '', brand: '', category: '', price: '', countInStock: '', minStock: '5' })
  const [stock, setStock] = useState({ price: '', countInStock: '', minStock: '5' })
  const [image, setImage] = useState(null)
  const [revision, setRevision] = useState(0)
  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  return <article className="panel"><h2>Add products to this store</h2>
    {(profile.loading || categories.loading || catalog.loading) && <p role="status">Loading store product tools...</p>}
    {status(action)}{[profile.error, categories.error, catalog.error].filter(Boolean).map((error) => <p role="alert" key={error}>{error}</p>)}
    <button disabled={action.busy || profile.loading || categories.loading || catalog.loading}
      onClick={() => action.run(() => Promise.all([profile.reload(), categories.reload(), catalog.reload()]))}>Refresh product tools</button>
    <details><summary>Create a new store product</summary>
      <form key={revision} onSubmit={(event) => {
        event.preventDefault()
        action.run(async () => {
          const inventory = inventoryPayload({ price: form.price, countInStock: form.countInStock, minStock: form.minStock })
          const imageUrl = await uploadProductImage(image)
          const result = await request(`/finance/accounts/store/${storeId}/products`, { ...form, ...inventory, image: imageUrl })
          setForm({ name: '', description: '', brand: '', category: '', price: '', countInStock: '', minStock: '5' }); setImage(null); setRevision((value) => value + 1)
          onSaved()
          await catalog.reload()
          notificationCheck(result)
        }, 'Product created for this store; owner notified.')
      }}><fieldset disabled={action.busy || !categories.data}>
        {['name', 'description', 'brand', 'price', 'countInStock', 'minStock'].map((field) => <label key={field}>{label(field)}
          <input required={field !== 'brand'} type={['price', 'countInStock', 'minStock'].includes(field) ? 'number' : 'text'}
            min="0" max={field === 'countInStock' ? 100000 : undefined} step={field === 'price' ? '0.01' : '1'} value={form[field]} onChange={(event) => change(field, event.target.value)} /></label>)}
        <label>Category<select required value={form.category} onChange={(event) => change('category', event.target.value)}>
          <option value="">Select category</option>{categories.data?.map((category) => <option key={category._id} value={category._id}>{category.name}</option>)}
        </select></label>
        <label>Product image<input required type="file" accept="image/*" onChange={(event) => setImage(event.target.files[0] || null)} /></label>
        <button>Create product & notify owner</button>
      </fieldset></form>
    </details>
    {profile.data?.inventoryEnabled && <details><summary>Add an existing catalog product</summary><form onSubmit={(event) => {
      event.preventDefault()
      action.run(async () => {
        const result = await request(`/finance/accounts/store/${storeId}/inventory/${productId}`, inventoryPayload(stock))
        setProductId(''); onSaved(); notificationCheck(result)
      }, 'Catalog product added to this store; owner notified.')
    }}><fieldset disabled={action.busy || !catalog.data}>
      <label>Catalog product<select required value={productId} onChange={(event) => {
        setProductId(event.target.value)
        const product = catalog.data.find((entry) => entry._id === event.target.value)
        setStock({ price: String(product?.price ?? ''), countInStock: '0', minStock: '5' })
      }}><option value="">Select product</option>{catalog.data?.map((product) => <option key={product._id} value={product._id}>{product.name}</option>)}</select></label>
      {Object.entries(stock).map(([field, value]) => <label key={field}>{label(field)}<input required type="number" min="0" step={field === 'price' ? '0.01' : '1'} value={value}
        onChange={(event) => setStock((current) => ({ ...current, [field]: event.target.value }))} /></label>)}
      <button>Add listing & notify owner</button>
    </fieldset></form></details>}
  </article>
}
