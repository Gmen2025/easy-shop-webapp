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
  return <section className={`page-stack admin-console${kind === 'store' ? ' admin-store-account' : ''}`}>
    <AdminNavigation /><Link to="/admin/income">All stores, owners & drivers</Link>
    {kind === 'store' ? <header className="account-page-heading"><h1>Account Business Dashboard</h1>
      <p>{profile.data?.account.name || 'Store owner'}</p></header> :
      <h1>{profile.data?.account.name || 'Driver'}: business dashboard</h1>}
    {profile.data && <p>{profile.data.account.isCompanyOwned ? 'AdduGenet-owned' : 'Independent'} | Account holder: {profile.data.owner?.name || 'No linked user'}</p>}
    {profile.error && <p role="alert">{profile.error}</p>}
    <p>Admin inspection: your own sign-in is retained. Delivery, ride and fulfillment actions remain with the operator.</p>
    <nav className="company-navigation" aria-label="Account dashboard sections">
      {kind === 'store' && <button className="account-income-link" aria-pressed={view === 'income'} onClick={() => setView('income')}>Products, inventory & income</button>}
      {views.filter(([key]) => kind !== 'store' || key !== 'income').map(([key, title]) =>
      <button key={key} aria-pressed={view === key} onClick={() => setView(key)}>{title}</button>)}</nav>
    {view === 'income' ? <>
      {kind === 'store' && <StoreAdditions storeId={accountId} onSaved={() => setProductRevision((value) => value + 1)} />}
      <FinancePage key={productRevision} admin embedded />
    </> : view === 'notify' ? <AccountNotification kind={kind} accountId={accountId} /> :
      <BusinessView key={`${kind}:${accountId}:${view}`} kind={kind} accountId={accountId} view={view} />}
  </section>
}

function BusinessView({ kind, accountId, view }) {
  const validate = useCallback((data) => ({
    snapshot: validateBusiness(data, kind, view), receivedAt: new Date(),
  }), [kind, view])
  const resource = useCompanyResource(businessPath(kind, accountId, view), validate)
  const action = useCompanyAction()
  const [period, setPeriod] = useState('weekly')
  const data = resource.data?.snapshot
  const updatedAt = resource.data?.receivedAt
  return <article className={kind === 'store' && view === 'dashboard' ? 'page-stack account-store-overview' : 'panel'}>
    {kind === 'store' ? <div className="account-refresh panel">
      <DashboardIcon name="refresh" color="#059669" />
      <div><strong>Last updated</strong><p>{updatedAt ? updatedAt.toLocaleString() : 'Not refreshed yet'}</p></div>
      <button className="solid-button" disabled={resource.loading || action.busy} onClick={() => action.run(resource.reload)}>
        {resource.loading || action.busy ? 'Refreshing...' : 'Refresh'}</button>
    </div> : <button disabled={resource.loading || action.busy} onClick={() => action.run(resource.reload)}>Refresh dashboard</button>}
    {resource.loading && <p role="status">Loading account dashboard...</p>}
    {(resource.error || action.error) && <p role="alert">{resource.error || action.error}</p>}
    {data && !resource.error && <>
      {view === 'dashboard' && <>
        <CompanyPeriods value={period} onChange={setPeriod} />
        {kind === 'store' ? <StorePerformance data={data} period={period} /> : <>
          <h2>{data.store?.name || 'Driver performance'}</h2>
          <p>Gross activity totals; use Income & settings for net allocations and separate payout currencies.</p>
          <Fields values={data.periods[period]} />
        </>}
        {kind === 'store' ? <>
          <section className="panel"><h2>Stock & operations</h2><h3>Inventory</h3><Fields values={data.inventory} />
            <h3>Orders</h3><Fields values={data.orders} /></section>
          <section className="panel"><h2>Active & recent orders</h2><BusinessOrders orders={[...data.activeOrders, ...data.recentOrders.filter((order) => !data.activeOrders.some((active) => active._id === order._id))]} /></section>
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

const storeMetrics = [
  ['sales', 'Sales', 'tag', '#059669'], ['earnings', 'Earnings', 'money', '#9333ea'],
  ['orders', 'Orders', 'clipboard', '#d97706'], ['completedOrders', 'Completed orders', 'check', '#2563eb'],
  ['unitsSold', 'Units sold', 'cube', '#9333ea'], ['averageOrder', 'Average order', 'chart', '#15803d'],
  ['reviews', 'Reviews', 'star', '#d97706'], ['averageRating', 'Average rating', 'star', '#2563eb'],
]
const numberText = (value) => Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 20 }) : 'Unavailable'
const dateText = (value) => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleString() : 'Unavailable'

function DashboardIcon({ name, color = '#d97706' }) {
  const paths = {
    refresh: 'M20 7v5h-5 M4 17v-5h5 M6 7a7 7 0 0 1 12-1l2 3 M4 15l2 3a7 7 0 0 0 12-1',
    chart: 'M4 20V12h3v8 M10 20V8h3v12 M16 20V4h3v16',
    tag: 'M3 3h8l10 10-8 8L3 11Z M7 7h.01',
    money: 'M8 3h8l-2 5c6 4 7 13-2 13S4 12 10 8Z M14 11h-3a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4h-3 M12 10v10',
    clipboard: 'M8 5H5v16h14V5h-3 M8 3h8v4H8Z M8 12h8 M8 16h8',
    check: 'M8 12l3 3 5-6 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
    cube: 'M12 2l9 5v10l-9 5-9-5V7Z M3 7l9 5 9-5 M12 12v10',
    star: 'M12 3l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z',
    clock: 'M12 7v5l4 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
    store: 'M4 10v11h16V10 M3 10l2-7h14l2 7Z M8 21v-7h5v7 M16 14h2',
    calendar: 'M4 5h16v16H4Z M8 3v4 M16 3v4 M4 10h16',
  }
  return <svg className="account-metric-icon" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={paths[name]} /></svg>
}

function StorePerformance({ data, period }) {
  const summary = data.periods[period]
  return <>
    <section className="panel account-performance">
      <div className="account-card-title"><DashboardIcon name="store" /><h2>Business Performance</h2></div>
      <dl className="account-summary">
        {[['sales', 'Total sales', 'chart', '#059669'], ['orders', 'Total orders', 'clipboard', '#2563eb'],
          ['earnings', 'Total earnings', 'money', '#059669']].map(([key, title, icon, color]) =>
          <div key={key}><dt><DashboardIcon name={icon} color={color} />{title}</dt><dd>{numberText(summary[key])}</dd></div>)}
      </dl>
    </section>
    <section className="panel account-gross">
      <div className="account-gross-heading"><DashboardIcon name="chart" color="#ffd400" /><h2>Gross Activity</h2></div>
      <div className="account-gross-body">
        <p>Net allocations and separate currencies are in Income & settings.</p>
        <dl className="account-activity">
          {storeMetrics.map(([key, title, icon, color]) => <div key={key}>
            <dt><DashboardIcon name={icon} color={color} />{title}</dt><dd>{numberText(summary[key])}</dd>
          </div>)}
        </dl>
        <dl className="account-dates">{['start', 'end'].map((key) => <div key={key}>
          <dt><DashboardIcon name="calendar" color={key === 'start' ? '#15803d' : '#dc2626'} />{label(key)}</dt>
          <dd>{dateText(summary[key])}</dd></div>)}</dl>
      </div>
    </section>
    <section className="panel">
      <div className="account-card-title"><DashboardIcon name="cube" /><h2>Products & Inventory</h2></div>
      <dl className="account-summary account-inventory">
        {[['total', 'Total', 'cube', '#059669'], ['approved', 'Approved', 'check', '#2563eb'],
          ['pending', 'Pending', 'clock', '#d97706'], ['readyFulfillments', 'Ready fulfillments', 'star', '#15803d']].map(([key, title, icon, color]) =>
          <div key={key}><dt><DashboardIcon name={icon} color={color} />{title}</dt><dd>{numberText(data.products[key])}</dd></div>)}
      </dl>
    </section>
  </>
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
