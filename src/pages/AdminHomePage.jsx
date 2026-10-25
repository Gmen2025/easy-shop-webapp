import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest, getSelectedDatabaseName } from '../api/client'
import { ADMIN_PERIODS, ADMIN_TOOLS, validateDashboard } from '../utils/adminDashboard'
import AdminNavigation from '../components/AdminNavigation'

function Metrics({ entries }) {
  return <dl className="admin-metrics">{entries.map(([label, value, tone]) =>
    <div className={tone ? `metric-${tone}` : ''} key={label}><dd>{value}</dd><dt>{label}</dt></div>)}</dl>
}

export default function AdminHomePage() {
  const [dashboard, setDashboard] = useState(null)
  const [period, setPeriod] = useState('daily')
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const request = useRef(0)
  const money = (value) => new Intl.NumberFormat(undefined, {
    style: 'currency', currency: getSelectedDatabaseName() === 'E_ShopUSA' ? 'USD' : 'ETB',
  }).format(value)
  const load = useCallback(() => {
    const revision = ++request.current
    return apiRequest('/orders/admin/dashboard').then(validateDashboard).then((result) => {
      if (revision === request.current) setDashboard(result)
    }).catch((failure) => {
      if (revision === request.current) setError(failure.message)
    }).finally(() => { if (revision === request.current) setBusy(false) })
  }, [])
  function refresh() {
    setBusy(true); setError('')
    load()
  }
  useEffect(() => {
    const requests = request
    load()
    return () => { requests.current++ }
  }, [load])
  const selected = dashboard?.periods[period]
  return <section className="admin-console page-stack">
    <header className="admin-console-header">
      <div><p className="eyebrow">Admin control center</p><h1>Sales dashboard</h1>
        <p>Completed order revenue · rolling periods · {getSelectedDatabaseName() === 'E_ShopUSA' ? 'USA' : 'Ethio'}</p></div>
      <button type="button" className="ghost-button" disabled={busy} onClick={refresh}>{busy ? 'Loading...' : 'Refresh analytics'}</button>
    </header>
    <AdminNavigation />
    <div className="admin-periods" role="group" aria-label="Sales period">{ADMIN_PERIODS.map(([key, label]) =>
      <button type="button" key={key} aria-pressed={period === key} onClick={() => setPeriod(key)}>{label}</button>)}</div>
    {busy ? <p role="status">Loading business analytics...</p> : null}
    {error ? <div className="status-card error-card" role="alert"><p>{error}</p>
      <button type="button" className="ghost-button" disabled={busy} onClick={refresh}>Retry analytics</button>
      {dashboard ? <p>Previously loaded figures are shown below and may be outdated.</p> : null}</div> : null}
    {selected ? <>
      <section className="admin-total-band" aria-label="Total sales"><span>Products + delivery</span>
        <strong>{money(selected.totalSales)}</strong><small>{selected.completedOrders} completed order(s)</small></section>
      <div className="admin-sales-split"><article><span>Product sales</span><strong>{money(selected.productSales)}</strong></article>
        <article><span>Delivery income</span><strong>{money(selected.deliveryIncome)}</strong></article></div>
      <section><h2>Period performance</h2><Metrics entries={[
        ['Orders placed', selected.orders], ['Completed', selected.completedOrders, 'green'],
        ['Units sold', selected.unitsSold], ['Avg. order', money(selected.averageOrder)],
        ['Avg. delivery', money(selected.averageDeliveryFee)], ['Cancelled', selected.cancelledOrders, 'red'],
      ]} /></section>
      <section className="panel"><h2>Payments</h2><dl className="admin-data-rows">
        {[['Recorded paid orders', selected.paidOrders], ['Pending payment records', selected.pendingPaymentOrders],
          ...Object.entries(selected.paymentMethods).sort((a, b) => b[1] - a[1]).map(([key, value]) => [key, money(value)])]
          .map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl></section>
      <section><h2>Operations</h2><Metrics entries={[
        ['Outstanding orders', dashboard.operations.outstandingOrders], ['Active deliveries', dashboard.operations.activeDeliveries, 'green'],
        ['Products', dashboard.inventory.products], ['Units in stock', dashboard.inventory.unitsInStock],
        ['Low stock', dashboard.inventory.lowStock, 'gold'], ['Out of stock', dashboard.inventory.outOfStock, 'red'],
      ]} /></section>
      <section className="panel"><dl className="admin-data-rows">
        {[['Inventory value', dashboard.inventory.value], ['Store payouts paid', dashboard.payouts.paid],
          ['Store payouts pending', dashboard.payouts.pending]].map(([label, value]) =>
          <div key={label}><dt>{label}</dt><dd>{money(value)}</dd></div>)}
      </dl></section>
      <section className="admin-lifetime"><div><h2>Lifetime recorded sales</h2><span>Combined revenue</span>
        <strong>{money(dashboard.lifetime.totalSales)}</strong></div><span>{dashboard.lifetime.completedOrders} orders</span></section>
      <section className="panel"><h2>Recent completed sales</h2>
        {dashboard.recentSales.length ? <ul className="admin-recent-sales">{dashboard.recentSales.map((sale) =>
          <li key={sale._id}><div><Link to="/admin/tools/orders">Order #{String(sale._id).slice(-6).toUpperCase()}</Link>
            <small>Products {money(sale.productSales)} · Delivery {money(sale.deliveryIncome)} · {new Date(sale.completedAt).toLocaleDateString()}</small></div>
            <strong>{money(sale.totalSales)}</strong></li>)}</ul> : <p>No completed sales yet.</p>}
      </section>
    </> : null}
    <section aria-labelledby="admin-manage-title"><h2 id="admin-manage-title">Manage</h2>
      <label className="admin-tool-search">Find an admin tool<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Products, drivers, payments..." /></label>
      <div className="admin-quick-actions">{ADMIN_TOOLS.filter(([title, detail]) => `${title} ${detail}`.toLowerCase().includes(search.toLowerCase())).map(([title, detail, to, group]) =>
        <Link to={to} key={title} className={`admin-quick-action admin-group-${group}`}><span className="admin-action-initial" aria-hidden="true">{title.slice(0, 1)}</span>
          <strong>{title}</strong><small>{detail}</small><span aria-hidden="true">&gt;</span></Link>)}</div>
      {!ADMIN_TOOLS.some(([title, detail]) => `${title} ${detail}`.toLowerCase().includes(search.toLowerCase())) ? <p>No tools match this search.</p> : null}
    </section>
  </section>
}
