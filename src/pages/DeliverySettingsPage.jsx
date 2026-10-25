import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest, getSelectedDatabaseName } from '../api/client'
import { deliveryRequest } from '../api/delivery'
import { getDeliverySettings, updateDeliverySettings } from '../api/serviceRequests'
import { VEHICLES } from '../utils/delivery'
import AdminNavigation from '../components/AdminNavigation'

const vehicleFields = [
  ['baseFee', 'Base fee'], ['distanceRate', 'Distance rate'],
  ['maxWeightKg', 'Usable payload (kg)'], ['maxVolumeLiters', 'Usable volume (liters)'],
  ['lengthCm', 'Cargo length (cm)'], ['widthCm', 'Cargo width (cm)'], ['heightCm', 'Cargo height (cm)'],
]
const packageFields = [['weightKg', 'Packaged weight (kg)'], ['lengthCm', 'Length (cm)'], ['widthCm', 'Width (cm)'], ['heightCm', 'Height (cm)']]
const policyFields = [
  ['standardMinBusinessDays', 'Standard: minimum business days'], ['standardMaxBusinessDays', 'Standard: maximum business days'],
  ['expressMinBusinessDays', 'Express: minimum business days'], ['expressMaxBusinessDays', 'Express: maximum business days'],
  ['standardSurcharge', 'Standard surcharge'], ['expressSurcharge', 'Express surcharge'],
  ['scheduledSurcharge', 'Scheduled surcharge'], ['scheduledWindowHours', 'Scheduled window (hours)'],
]
function emptyConfig() {
  return { enabled: false, vehicles: Object.fromEntries(VEHICLES.map((type) =>
    [type, { enabled: false, ...Object.fromEntries(vehicleFields.map(([field]) => [field, 0])) }])) }
}

export default function DeliverySettingsPage() {
  const [config, setConfig] = useState(null)
  const [policy, setPolicy] = useState(null)
  const [origin, setOrigin] = useState(null)
  const [products, setProducts] = useState([])
  const [drivers, setDrivers] = useState([])
  const [productId, setProductId] = useState('')
  const [size, setSize] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const guard = useRef(false)
  useEffect(() => {
    let current = true
    Promise.all([deliveryRequest('delivery-config'), getDeliverySettings(), apiRequest('/products'), apiRequest('/drivers/admin/company-drivers')])
      .then(([settings, delivery, catalog, companyDrivers]) => {
        if (!current) return
        if (!Array.isArray(companyDrivers)) throw new Error('The API returned an invalid company-driver list.')
        const defaults = emptyConfig()
        setConfig({ ...defaults, ...settings, vehicles: Object.fromEntries(VEHICLES.map((type) =>
          [type, { ...defaults.vehicles[type], ...settings.vehicles?.[type] }])) })
        setPolicy(delivery.deliveryConfig)
        setOrigin(delivery.deliveryOrigin)
        setProducts(catalog)
        setDrivers(companyDrivers)
      }).catch((failure) => { if (current) setError(failure.message) })
    return () => { current = false }
  }, [])
  async function run(action) {
    if (guard.current) return
    guard.current = true; setBusy(true); setError(''); setMessage('')
    try { await action() } catch (failure) { setError(failure.message) }
    finally { guard.current = false; setBusy(false) }
  }
  return <section className="panel delivery-page">
    <AdminNavigation />
    <div className="panel-header"><h1>Shared delivery configuration</h1><Link to="/admin">Admin dashboard</Link></div>
    <Link to="/admin/delivery-payments">Combined payments, cancellations & refunds</Link>
    <p><Link to="/admin/international-payments">Daily exchange rates, USD services & US-to-Ethiopia shipping</Link></p>
    <p>Changes apply to mobile and web in the selected region. Configure Google Geocoding, Distance Matrix and Routes on the backend.
      Complete the existing per-store inventory migration before enabling. No migration is performed here.</p>
    {error ? <p role="alert">{error}</p> : null}{message ? <p role="status">{message}</p> : null}
    <fieldset className="delivery-fieldset" disabled={busy}>
      {config ? <>
        <label><input type="checkbox" checked={config.enabled} onChange={(event) => setConfig({ ...config, enabled: event.target.checked })} />Enable multi-delivery checkout</label>
        <p>Rates use regional currency per {/usa/i.test(getSelectedDatabaseName()) ? 'mile' : 'kilometer'} of Google's driving route.
          Enter conservative usable vehicle capacities, not nominal exterior dimensions.</p>
        <div className="delivery-vehicle-grid">{VEHICLES.map((type) => <article key={type} className="order-card">
          <h2>{type}</h2>
          <label><input type="checkbox" checked={config.vehicles[type].enabled} onChange={(event) =>
            setConfig({ ...config, vehicles: { ...config.vehicles, [type]: { ...config.vehicles[type], enabled: event.target.checked } } })} />Enabled</label>
          {vehicleFields.map(([field, label]) => <label key={field}>{label}<input type="number" min="0" step="any" value={config.vehicles[type][field]} onChange={(event) =>
            setConfig({ ...config, vehicles: { ...config.vehicles, [type]: { ...config.vehicles[type], [field]: event.target.value } } })} /></label>)}
        </article>)}</div>
        <button className="solid-button" onClick={() => run(async () => {
          setConfig(await deliveryRequest('delivery-config', { method: 'PUT', data: config }))
          setMessage('Vehicle configuration saved for web and mobile.')
        })}>Save vehicles & activation</button>
      </> : <p>Loading vehicle configuration...</p>}
      {policy ? <article className="order-card"><h2>Delivery speeds & windows</h2>
        <p>These business-day windows and speed surcharges are shared with mobile. Vehicle route fees are configured above.</p>
        <div className="form-grid">{policyFields.map(([field, label]) => <label key={field}>{label}
          <input type="number" min="0" step="any" value={policy[field] ?? ''} onChange={(event) => setPolicy({ ...policy, [field]: event.target.value })} />
        </label>)}</div>
        <button className="solid-button" onClick={() => run(async () => {
          const result = await updateDeliverySettings(policy, origin)
          setPolicy(result.deliveryConfig)
          setMessage('Shared delivery windows and surcharges saved.')
        })}>Save delivery policy</button>
      </article> : null}
      <article className="order-card"><h2>Product packaged measurements</h2>
        <p>Measure one packaged sale unit. Domestic measurements are optional; incomplete cargo requires a manual vehicle selection.
          Blank fields clear the saved measurement. International shipping requires complete measurements.</p>
        <label>Product<select value={productId} onChange={(event) => {
          setProductId(event.target.value)
          const product = products.find((entry) => (entry._id || entry.id) === event.target.value)
          setSize(Object.fromEntries(packageFields.map(([field]) => [field, product?.packageSize?.[field] ?? ''])))
        }}><option value="">Select a product</option>{products.map((product) =>
          <option key={product._id || product.id} value={product._id || product.id}>{product.name}</option>)}</select></label>
        {productId ? <>
          <div className="form-grid">{packageFields.map(([field, label]) => <label key={field}>{label}<input type="number" min="0" step="any"
            value={size[field] ?? ''} onChange={(event) => setSize({ ...size, [field]: event.target.value })} /></label>)}</div>
          <button className="solid-button" onClick={() => run(async () => {
            const saved = await deliveryRequest(`delivery-products/${productId}`, { method: 'PUT', data: size })
            setProducts((previous) => previous.map((product) => (product._id || product.id) === productId ? saved : product))
            setMessage('Packaged measurements saved.')
          })}>Save packaged measurements</button>
        </> : null}
      </article>
      <section><h2>Company driver vehicle & availability</h2>
        <p>Existing company-driver accounts are shared with mobile. <Link to="/admin/operations/drivers">Onboard, approve and manage drivers</Link>.
          Saving a vehicle change is blocked by the server during an active passenger trip. Availability does not override suspension or capacity.</p>
        {drivers.map((driver) => <article className="order-card" key={driver._id}>
          <h3>{driver.name}</h3><p>{driver.email} | Approval: {driver.approvalStatus}{driver.isSuspended ? ' | Suspended' : ''}</p>
          <label>Delivery vehicle<select value={driver.vehicleType || ''} onChange={(event) =>
            setDrivers((previous) => previous.map((entry) => entry._id === driver._id ? { ...entry, vehicleType: event.target.value } : entry))}>
            <option value="">Unconfigured</option>{!VEHICLES.includes(driver.vehicleType) && driver.vehicleType ? <option value={driver.vehicleType}>{driver.vehicleType}</option> : null}
            {VEHICLES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select></label>
          <label><input type="checkbox" checked={Boolean(driver.isAvailable)} onChange={(event) =>
            setDrivers((previous) => previous.map((entry) => entry._id === driver._id ? { ...entry, isAvailable: event.target.checked } : entry))} />Available for assignment</label>
          <button className="solid-button" onClick={() => run(async () => {
            const result = await apiRequest(`/drivers/admin/company-drivers/${driver._id}`, {
              method: 'PUT', body: JSON.stringify({ vehicleType: driver.vehicleType, isAvailable: Boolean(driver.isAvailable) }),
            })
            setDrivers((previous) => previous.map((entry) => entry._id === driver._id ? result.driver : entry))
            setMessage('Shared driver vehicle and availability saved.')
          })}>Save driver assignment settings</button>
        </article>)}
      </section>
    </fieldset>
  </section>
}
