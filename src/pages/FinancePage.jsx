import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiRequest } from '../api/client'
import AdminNavigation from '../components/AdminNavigation'
import { CompanyPeriods } from '../components/CompanyNavigation'
import useCompanyResource, { useCompanyAction } from '../features/company/useCompanyResource'
import { operationList } from '../utils/adminOperations'
import { accountPath, financeMoney, payoutAmount, validateFinanceAccount, validateFinanceReport } from '../utils/finance'

const accountsResponse = (data) => operationList(data)
const send = (path, method, data) => apiRequest(path, { method, body: JSON.stringify(data) })

export function OwnershipIncomeReport({ period }) {
  const resource = useCompanyResource('/finance/admin/report', validateFinanceReport)
  const action = useCompanyAction()
  return <section className="panel" aria-label="Ownership income report">
    <h2>AdduGenet & independent income</h2>
    <p>Completed income, not necessarily collected funds. ETB and USD are never combined.</p>
    {resource.loading && <p role="status">Loading ownership reporting...</p>}
    {(resource.error || action.error) && <p role="alert">{resource.error || action.error}</p>}
    <button disabled={resource.loading || action.busy} onClick={() => action.run(resource.reload)}>Refresh ownership report</button>
    {resource.data && !resource.error && Object.entries(resource.data.reports).map(([currency, periods]) => {
      const report = periods[period]
      return <article className="order-card" key={currency}><h3>{currency}</h3>
        <dl className="admin-data-rows">{[
          ['AdduGenet total income', report.adduGenetIncome], ['Owned stores & drivers', report.ownedIncome],
          ['Independent platform fees', report.platformFees], ['Service fulfillment (AdduGenet)', report.serviceIncome],
          ['Independent operators net income', report.independentIncome], ['Unassigned: admin accounting review', report.unallocatedIncome],
        ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{financeMoney(value, currency)}</dd></div>)}</dl>
        {Object.entries(report.categories).map(([category, values]) => <p key={category}>{category}: AdduGenet {financeMoney(values.adduGenetIncome, currency)} / Independent {financeMoney(values.independentIncome, currency)}</p>)}
      </article>
    })}
    <p>No payout provider is connected. Payment requests require a manual transfer and confirmation.</p>
    <Link className="solid-button" to="/admin/income">Stores & drivers: income, fees & payout access</Link>
  </section>
}

export default function FinancePage({ admin = false, kind: selfKind }) {
  const { kind: routeKind, accountId = 'me' } = useParams()
  const kind = routeKind || selfKind
  return <section className="page-stack admin-console">
    {admin ? <AdminNavigation /> : <Link to="/profile">Back to account</Link>}
    {kind ? <AccountIncome key={`${kind}:${accountId}`} kind={kind} accountId={accountId} admin={admin} /> : <IncomeAccounts />}
  </section>
}

function IncomeAccounts() {
  const resource = useCompanyResource('/finance/admin/accounts', accountsResponse)
  const action = useCompanyAction()
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const accounts = resource.data?.filter((item) => (filter === 'all' ||
    (filter === 'owned' ? item.isCompanyOwned : !item.isCompanyOwned)) &&
    `${item.name} ${item.kind} ${item.email}`.toLowerCase().includes(search.toLowerCase()))
  return <>
    <h1>Store & driver income</h1>
    <p>Open an account to inspect income, products, balances, ownership and fee settings. You remain signed in as Admin.</p>
    <Feedback resource={resource} action={action} />
    <button disabled={resource.loading || action.busy} onClick={() => action.run(resource.reload)}>Refresh accounts</button>
    <div className="form-grid">
      <label>Ownership<select value={filter} onChange={(event) => setFilter(event.target.value)}>
        <option value="all">All accounts</option><option value="owned">AdduGenet-owned</option><option value="independent">Independent</option>
      </select></label>
      <label>Search accounts<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
    </div>
    {!resource.error && accounts?.length === 0 && <p>No matching accounts.</p>}
    {!resource.error && accounts?.map((account) => <article className="order-card" key={`${account.kind}:${account._id}`}>
      <h2><Link to={`/admin/income/${account.kind}/${account._id}`}>{account.name}</Link></h2>
      <p>{account.kind} - {account.isCompanyOwned ? 'AdduGenet-owned' : 'Independent'} - {account.approvalStatus}</p>
      <p>Payout requests {account.payoutsEnabled ? 'enabled' : 'disabled'}</p>
    </article>)}
  </>
}

function Feedback({ resource, action }) {
  return <>
    {resource?.loading && <p role="status">Loading financial data...</p>}
    {(resource?.error || action.error) && <p role="alert">{resource?.error || action.error}</p>}
    {action.notice && <p role="status">{action.notice}</p>}
  </>
}

function AccountIncome({ kind, accountId, admin }) {
  const navigate = useNavigate()
  const path = accountPath(kind, accountId)
  const resource = useCompanyResource(path, validateFinanceAccount)
  const action = useCompanyAction()
  const [currency, setCurrency] = useState('ETB')
  const [period, setPeriod] = useState('weekly')
  const [amount, setAmount] = useState('')
  const request = useRef(null)
  const data = resource.data
  const balance = data?.balances.find((item) => item.currency === currency)
  const summary = data?.periods[period][currency]
  return <>
    {admin && <Link to="/admin/income">All income accounts</Link>}
    <h1>{data?.account.name || 'Account income'}: income & payouts</h1>
    <Feedback resource={resource} action={action} />
    <button disabled={resource.loading || action.busy} onClick={() => action.run(resource.reload)}>Refresh income</button>
    {data && !resource.error && <>
      <p>{data.account.isCompanyOwned ? 'AdduGenet-owned: income belongs to AdduGenet.' : 'Independent: income after platform fees.'}</p>
      {data.locations.length > 1 && <label>Store location<select value={data.account._id} disabled={action.busy}
        onChange={(event) => navigate(`/income/store/${event.target.value}`)}>
        {data.locations.map((location) => <option key={location._id} value={location._id}>{location.name}</option>)}
      </select></label>}
      <label>Currency<select value={currency} onChange={(event) => setCurrency(event.target.value)}>
        <option>ETB</option><option>USD</option>
      </select></label>
      <CompanyPeriods value={period} onChange={setPeriod} />
      <article className="panel"><h2>Selected period</h2>
        <p>Gross completed income: {financeMoney(summary.gross, currency)}</p>
        <p>AdduGenet allocation: {financeMoney(summary.adduGenetIncome, currency)}</p>
        <p>Independent net income: {financeMoney(summary.independentIncome, currency)}</p>
        {Object.entries(summary.categories).map(([category, values]) => <p key={category}>
          {category}: gross {financeMoney(values.gross, currency)} / net {financeMoney(values.independentIncome, currency)}
        </p>)}
      </article>
      <article className="panel"><h2>Lifetime collected balance</h2>
        <dl className="admin-data-rows">{[
          ['Net earned', balance.totalEarned], ['Collected for payout', balance.collected],
          ['Paid out', balance.paidOut], ['Reserved payouts', balance.pending], ['Available to request', balance.available],
          ['Cash collections (manual reconciliation; excluded)', balance.cashReceived],
        ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{financeMoney(value, currency)}</dd></div>)}</dl>
        {balance.shortfall > 0 && <p role="alert">Refund/adjustment shortfall: {financeMoney(balance.shortfall, currency)}. Admin review required.</p>}
        <p>{data.schedule}</p><p>Only completed, confirmed collected non-cash income is payable, after fees, refunds and paid/reserved payouts. Cash requires manual reconciliation. Requests above available funds enter unreserved admin review.</p>
        <p>Payout requests {data.account.payoutsEnabled ? 'enabled' : 'disabled by admin'}.</p>
        <form onSubmit={(event) => {
          event.preventDefault()
          if (!window.confirm(`Request ${currency} ${amount} for manual admin payment? Above-balance requests enter unreserved admin review. No automatic transfer will occur.`)) return
          action.run(async () => {
            const value = payoutAmount(amount)
            const signature = `${accountId}:${currency}:${value}`
            if (request.current?.signature !== signature) request.current = { signature, key: crypto.randomUUID() }
            await send(`${path}/payouts`, 'POST', { amount: value, currency, requestKey: request.current.key })
            request.current = null
            setAmount('')
            await resource.reload()
          }, 'Payment request submitted. Review payout history for status. No funds transferred.')
        }}><fieldset disabled={action.busy || resource.loading || !data.account.payoutsEnabled}>
          <label>Payment amount<input required type="number" step="0.01" min="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
          <button className="solid-button">{admin ? 'Reserve manual payout' : 'Request early payment'}</button>
        </fieldset></form>
        {admin && <Link to="/admin/operations/payouts">Review, reject or confirm manual payments</Link>}
      </article>
      {admin && <FinanceSettings key={`${data.account._id}:${data.account.isCompanyOwned}:${data.account.payoutsEnabled}:${JSON.stringify(data.account.financeFees)}`}
        account={data.account} path={path} reload={resource.reload} />}
      {kind === 'store' && <article className="panel"><h2>Products & inventory</h2>
        {!data.products.length && !data.inventory.length && <p>No products for this store.</p>}
        {data.products.map((product) => <ProductEditor key={product._id} product={product} admin={admin} reload={resource.reload} />)}
        {data.inventory.map((stock) => <InventoryEditor key={`${stock._id}:${stock.price}:${stock.countInStock}:${stock.minStock}`} stock={stock} admin={admin} storeId={data.account._id} reload={resource.reload} />)}
      </article>}
      <article className="panel"><h2>Recent payouts</h2>
        {data.payouts.filter((payout) => payout.currency === currency).map((payout) => <div className="order-card" key={payout._id}>
          <p>{payout.payoutType}: {financeMoney(payout.amount, currency)} - {payout.status}</p>
          <p>{new Date(payout.dateRequested).toLocaleString()} {payout.reference}</p>
          {payout.adminNotes && <p>{payout.adminNotes}</p>}
        </div>)}
      </article>
      <article className="panel"><h2>Recent completed transactions</h2>
        {data.entries.filter((entry) => entry.currency === currency).map((entry) => <div className="order-card" key={entry._id}>
          <h3>{entry.category} #{String(entry.sourceId).slice(-6)} - {entry.ownership}</h3>
          <p>Gross {financeMoney(entry.grossMinor / 100, currency)} / AdduGenet {financeMoney(entry.platformMinor / 100, currency)} / Net {financeMoney(entry.netMinor / 100, currency)}</p>
          <p>{entry.voided ? 'Refund/cancellation adjustment' : entry.collected ? 'Collected' : 'Awaiting collection'} - {new Date(entry.completedAt).toLocaleString()}</p>
        </div>)}
      </article>
    </>}
  </>
}

function FinanceSettings({ account, path, reload }) {
  const [owned, setOwned] = useState(account.isCompanyOwned)
  const [enabled, setEnabled] = useState(account.payoutsEnabled)
  const [fees, setFees] = useState(account.financeFees)
  const action = useCompanyAction()
  return <article className="panel"><h2>Admin ownership, fees & payout access</h2>
    <Feedback action={action} />
    <form onSubmit={(event) => {
      event.preventDefault()
      if (!window.confirm('Save ownership, platform fees and payout access? This affects future completions, not existing allocations.')) return
      action.run(async () => {
        const result = await send(`${path}/settings`, 'PUT', {
          isCompanyOwned: owned, payoutsEnabled: enabled,
          financeFees: Object.fromEntries(Object.entries(fees).map(([category, fee]) => [category, { type: fee.type, value: Number(fee.value) }])),
        })
        if (result.notification?.error) throw new Error(`Settings saved, but notification failed: ${result.notification.error}`)
        await reload()
      }, 'Ownership, fees and payout access saved.')
    }}><fieldset disabled={action.busy}>
      <label><input type="checkbox" checked={owned} onChange={(event) => setOwned(event.target.checked)} />AdduGenet-owned</label>
      <label><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />Enable payout requests</label>
      {Object.entries(fees).map(([category, fee]) => <div className="form-grid" key={category}>
        <label>{category} fee type<select value={fee.type} onChange={(event) => setFees((current) => ({ ...current, [category]: { ...fee, type: event.target.value } }))}>
          <option value="percent">Percent</option><option value="fixed">Fixed per transaction (transaction currency)</option>
        </select></label>
        <label>{category} fee value<input required type="number" min="0" max={fee.type === 'percent' ? 100 : undefined} step="0.01" value={fee.value}
          onChange={(event) => setFees((current) => ({ ...current, [category]: { ...fee, value: event.target.value } }))} /></label>
      </div>)}
      <p>Owned income goes entirely to AdduGenet. Independent fees cannot exceed the transaction amount. No payout provider is connected.</p>
      <button className="solid-button">Save financial settings</button>
    </fieldset></form>
  </article>
}

function ProductEditor({ product, admin, reload }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: product.name, description: product.description || '', brand: product.brand || '', price: product.price, countInStock: product.countInStock })
  const action = useCompanyAction()
  return <article className="order-card"><h3>{product.name}</h3><p>Catalog price: {product.price} / Stock: {product.countInStock}</p>
    <Feedback action={action} />
    {admin && <button disabled={action.busy} onClick={() => {
      if (!editing) setForm({ name: product.name, description: product.description || '', brand: product.brand || '', price: product.price, countInStock: product.countInStock })
      setEditing((current) => !current)
    }}>{editing ? 'Cancel edit' : 'Edit product details & notify owner'}</button>}
    {editing && <form onSubmit={(event) => {
      event.preventDefault()
      action.run(async () => {
        const result = await apiRequest(`/products/${encodeURIComponent(product._id)}`, { method: 'PUT',
          body: JSON.stringify({ ...form, price: Number(form.price), countInStock: Number(form.countInStock), category: product.category?._id || product.category }) })
        if (result.notificationWarnings?.length) throw new Error('Product saved, but owner notification failed. Notify the owner manually.')
        setEditing(false)
        await reload()
      }, 'Product updated; linked owners notified.')
    }}><fieldset disabled={action.busy}><div className="form-grid">
      {Object.entries(form).map(([field, value]) => <label key={field}>{field}<input required={['name', 'price', 'countInStock'].includes(field)} value={value}
        type={['price', 'countInStock'].includes(field) ? 'number' : 'text'} min={['price', 'countInStock'].includes(field) ? 0 : undefined}
        step={field === 'price' ? '0.01' : field === 'countInStock' ? '1' : undefined}
        onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))} /></label>)}
    </div><button className="solid-button">Save product</button></fieldset></form>}
  </article>
}

function InventoryEditor({ stock, storeId, admin, reload }) {
  const [form, setForm] = useState({ price: stock.price, countInStock: stock.countInStock, minStock: stock.minStock })
  const action = useCompanyAction()
  return <article className="order-card"><h3>{stock.product?.name || 'Unavailable product'}</h3>
    <p>Store price: {stock.price} / Stock: {stock.countInStock} / Reserved: {stock.reserved}</p>
    <Feedback action={action} />
    {admin && stock.product && <>
      <details><summary>Edit shared catalog details</summary><ProductEditor product={stock.product} admin reload={reload} /></details>
      <form onSubmit={(event) => {
        event.preventDefault()
        action.run(async () => {
          const result = await send(`/finance/accounts/store/${storeId}/inventory/${stock.product._id}`, 'PUT',
            Object.fromEntries(Object.entries(form).map(([key, value]) => [key, Number(value)])))
          if (result.notification?.error) throw new Error(`Inventory saved, but owner notification failed: ${result.notification.error}`)
          await reload()
        }, 'Store inventory updated; owner notified.')
      }}><fieldset disabled={action.busy}><div className="form-grid">
        {Object.entries(form).map(([field, value]) => <label key={field}>{field}<input required type="number" min={field === 'countInStock' ? stock.reserved : 0}
          step={field === 'price' ? '0.01' : '1'} value={value} onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))} /></label>)}
      </div><button className="solid-button">Save store price & stock</button></fieldset></form>
    </>}
  </article>
}
