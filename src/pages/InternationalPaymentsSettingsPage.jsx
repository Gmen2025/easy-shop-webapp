import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { apiRequest, getSelectedDatabaseName } from '../api/client'
import { deliveryRequest } from '../api/delivery'
import { ADDRESS_FIELDS } from '../utils/delivery'
import { rateIsActive } from '../utils/checkoutPayment'
import AdminNavigation from '../components/AdminNavigation'

const tariffFields = [
  ['baseUsd', 'Base shipping fee (USD)'], ['perKgUsd', 'USD per billable kg'],
  ['minimumUsd', 'Minimum shipment fee (USD)'], ['volumetricDivisor', 'Volumetric divisor (cm3 / kg)'],
  ['maxWeightKg', 'Maximum billable kg per recipient'], ['maxDimensionCm', 'Maximum parcel dimension (cm)'],
]

export default function InternationalPaymentsSettingsPage() {
  const { hash } = useLocation()
  const usa = /usa/i.test(getSelectedDatabaseName())
  const [saved, setSaved] = useState(null)
  const [policy, setPolicy] = useState(null)
  const [rate, setRate] = useState('')
  const [shipping, setShipping] = useState(null)
  const [products, setProducts] = useState([])
  const [search, setSearch] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const guard = useRef(false)
  const loadExchange = useCallback(async () => {
    const result = await apiRequest('/exchange-rate/')
    setSaved(result); setPolicy(result); setRate(result.birrPerUsd == null ? '' : String(result.birrPerUsd))
    setNow(Date.now())
  }, [])
  useEffect(() => {
    let current = true
    apiRequest('/exchange-rate/').then((result) => {
      if (current) { setSaved(result); setPolicy(result); setRate(result.birrPerUsd == null ? '' : String(result.birrPerUsd)) }
    }).catch((failure) => { if (current) setError(failure.message) })
    if (usa) {
      Promise.all([deliveryRequest('international-shipping-config'), apiRequest('/products')])
        .then(([config, catalog]) => {
          if (!current) return
          setShipping({ ...config, hub: config.hub || Object.fromEntries(ADDRESS_FIELDS.map(([field]) => [field, field === 'country' ? 'USA' : ''])) })
          setProducts(catalog)
        }).catch((failure) => { if (current) setError(failure.message) })
    }
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => { current = false; clearInterval(timer) }
  }, [usa])
  async function run(action) {
    if (guard.current) return
    guard.current = true; setBusy(true); setError(''); setMessage('')
    try { await action() } catch (failure) { setError(failure.message) }
    finally { guard.current = false; setBusy(false) }
  }
  const shippingReady = Boolean(shipping)
  useEffect(() => {
    if (shippingReady && hash === '#shipping') document.getElementById('shipping')?.scrollIntoView({ block: 'start' })
  }, [shippingReady, hash])
  return <section className="panel delivery-page">
    <AdminNavigation />
    <div className="panel-header"><h1>{usa ? 'US exports paid in birr' : 'Ethiopia USD purchases & service payments'}</h1><Link to="/admin/delivery">Delivery settings</Link></div>
    <div className="action-row"><Link to="/admin/tools/banks">Bank account configuration</Link><Link to="/admin/delivery-payments">Payments & shipment tracking</Link></div>
    <p>{usa ? 'ETB = USD products + US hub route fees + international shipping, multiplied by birr per USD. Product-only; no service or ride birr payments.' :
      'USD = ETB total divided by birr per USD. Products and Admin-quoted non-ride services stay in Ethiopia.'}</p>
    {error ? <p role="alert">{error}</p> : null}{message ? <p role="status">{message}</p> : null}
    <fieldset disabled={busy} className="delivery-fieldset">
      <button className="ghost-button" onClick={() => run(loadExchange)}>Reload saved exchange settings / status</button>
      {policy ? <>
        <article className="order-card">
          <label><input type="checkbox" checked={Boolean(policy.enabled)} onChange={(event) => setPolicy({ ...policy, enabled: event.target.checked })} />Enable {usa ? 'USA birr exports' : 'Ethiopia USD checkout'}</label>
          <label><input type="checkbox" checked={Boolean(policy.autoRefresh)} onChange={(event) => setPolicy({ ...policy, autoRefresh: event.target.checked })} />Automatically refresh expired rates</label>
          <label>Server-configured provider<select value={policy.provider || ''} onChange={(event) => setPolicy({ ...policy, provider: event.target.value })}>
            <option value="">Choose a provider</option>{(saved.providers || []).map((provider) => <option value={provider} key={provider}>{provider}</option>)}
          </select></label>
          {!saved.providers?.length ? <p>No automatic providers configured on the backend. Use manual Apply or configure a server provider.</p> : null}
          <p>Saving enablement or provider settings does not refresh the rate or extend expiry. Save the provider before fetching.</p>
          <button className="solid-button" onClick={() => run(async () => {
            await apiRequest('/exchange-rate/', { method: 'PUT', body: JSON.stringify({
              enabled: Boolean(policy.enabled), autoRefresh: Boolean(policy.autoRefresh), provider: policy.provider || '',
            }) })
            await loadExchange(); setMessage('Exchange settings saved. The applied timestamp is unchanged.')
          })}>Save service & automation settings</button>
        </article>
        <article className="order-card">
          <h2>Daily exchange rate</h2>
          <label>Birr for 1 USD<input type="number" min="0" step="any" value={rate} onChange={(event) => setRate(event.target.value)} /></label>
          <button className="solid-button" onClick={() => run(async () => {
            await apiRequest('/exchange-rate/apply', { method: 'POST', body: JSON.stringify({ birrPerUsd: rate }) })
            await loadExchange(); setMessage('Rate applied with a new timestamp and revision, even if the numeric rate is unchanged.')
          })}>Apply rate / renew 24 hours</button>
          <button className="ghost-button" onClick={() => run(async () => {
            await apiRequest('/exchange-rate/refresh', { method: 'POST' })
            await loadExchange(); setMessage('Provider rate applied.')
          })}>Fetch & apply from saved provider</button>
          <p role="status">{rateIsActive(saved, now) ? 'Cross-currency checkout active: rate is current.' : saved.message}</p>
          <p>Current rate: {saved.birrPerUsd ?? 'Not set'} ETB / USD | Revision: {saved.revision || 0} | Source: {saved.source || 'None'}</p>
          <p>Applied: {saved.appliedAt ? new Date(saved.appliedAt).toLocaleString() : 'Never'} | Expires: {saved.expiresAt ? new Date(saved.expiresAt).toLocaleString() : 'No rate'}</p>
          <p>Provider timestamp: {saved.providerAsOf ? new Date(saved.providerAsOf).toLocaleString() : 'Manual / none'} | Last attempt: {saved.lastAttemptAt ? new Date(saved.lastAttemptAt).toLocaleString() : 'None'}</p>
          {saved.lastError ? <p role="alert">{saved.lastError}</p> : null}
          <p>At exactly 24 hours the rate expires for new reservations. Failed fetches do not renew it. Prepared payments retain their saved rate and amount.</p>
          <p>{usa ? 'Configure explicitly ETB-tagged bank accounts in the USA database. Exports are bank-only; funds must be verified before fulfillment.' :
            `Configure explicitly USD-tagged bank accounts. Cash is not supported for USD checkout. Dedicated Ethiopia USD card merchant: ${saved.cardAvailable ? 'configured' : 'not configured'}.`}</p>
          <h3>Latest applied updates</h3>
          {[...(saved.history || [])].reverse().map((entry, index) => <p key={index}>{new Date(entry.appliedAt).toLocaleString()} - {entry.birrPerUsd} ETB/USD - {entry.source} - {entry.changed ? 'Rate changed' : 'Same rate, update applied'}</p>)}
        </article>
      </> : <p>Loading exchange settings...</p>}
      {usa && shipping ? <>
        <article id="shipping" className="order-card"><h2>US consolidation hub & shipping tariff</h2>
          <p>This configures Admin pricing, not a live carrier booking or label purchase. Tariff must include final Ethiopian address delivery, excluding customs/duties.</p>
          <label><input type="checkbox" checked={Boolean(shipping.enabled)} onChange={(event) => setShipping({ ...shipping, enabled: event.target.checked })} />Enable international shipping</label>
          <div className="form-grid">{ADDRESS_FIELDS.map(([field, label]) => <label key={field}>Hub {label}
            <input maxLength={300} value={shipping.hub[field] || ''} onChange={(event) => setShipping({ ...shipping, hub: { ...shipping.hub, [field]: event.target.value } })} />
          </label>)}</div>
          <div className="form-grid">{tariffFields.map(([field, label]) => <label key={field}>{label}
            <input type="number" min="0" step="any" value={shipping[field] ?? ''} onChange={(event) => setShipping({ ...shipping, [field]: event.target.value })} />
          </label>)}</div>
          <p>Billable kg = greater of total actual kg and packaged volume / divisor, rounded up to 0.001 kg per recipient.
            Shipping USD = max(minimum, base + billable kg x rate). US road delivery is added separately.</p>
          <button className="solid-button" onClick={() => run(async () => {
            setShipping(await deliveryRequest('international-shipping-config', { method: 'PUT', data: shipping, timeoutMs: 60000 }))
            setMessage('Hub and tariff saved. Unprepared quotes must be recalculated; prepared orders retain their snapshots.')
          })}>Save hub & shipping tariff</button>
        </article>
        <article className="order-card"><h2>Products approved for export</h2>
          <p>Only approve after verifying legal import/export, carrier coverage and complete packaged measurements.</p>
          <label>Search US catalog<input value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          {products.filter((product) => product.name.toLowerCase().includes(search.toLowerCase())).map((product) => <div className="action-row" key={product._id || product.id}>
            <span>{product.name}: {product.exportToEthiopia ? 'Export approved' : 'Domestic only'}</span>
            <button className="ghost-button" onClick={() => run(async () => {
              const updated = await deliveryRequest(`international-products/${product._id || product.id}`, { method: 'PUT', data: { exportToEthiopia: !product.exportToEthiopia } })
              setProducts((previous) => previous.map((entry) => (entry._id || entry.id) === (product._id || product.id) ? updated : entry))
              setMessage('Product export eligibility saved.')
            })}>{product.exportToEthiopia ? 'Remove export approval' : 'Approve for Ethiopia export'}</button>
          </div>)}
          <Link to="/admin/delivery">Configure package measurements & US vehicles</Link>
        </article>
      </> : null}
    </fieldset>
  </section>
}
