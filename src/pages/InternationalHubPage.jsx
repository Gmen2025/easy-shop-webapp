import { useCallback, useEffect, useRef, useState } from 'react'
import { apiRequest } from '../api/client'
import AdminNavigation from '../components/AdminNavigation'
import { formatInternationalChargeAmount, internationalChargeLabel, internationalHubSteps, internationalStageLabel, INTERNATIONAL_CHARGE_TYPES, buildInternationalChargesPayload } from '../utils/internationalHub'

const emptyForm = () => ({ note: '', charges: [{ type: 'customs_duty', amount: '', label: '' }], driverId: '', orderId: '', customsOrderIds: [], reconcileOrderIds: [] })
const shipmentKey = (shipment) => `${shipment.groupId}:${shipment.shipmentId}`
const pendingCustomsPackages = (shipment) => (shipment.packages || []).filter((pkg) => !pkg.cancelled && !pkg.customsCollected)

export default function InternationalHubPage() {
  const [access, setAccess] = useState(null)
  const [config, setConfig] = useState(null)
  const [stores, setStores] = useState([])
  const [shipments, setShipments] = useState([])
  const [drivers, setDrivers] = useState([])
  const [includeAll, setIncludeAll] = useState(false)
  const [forms, setForms] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const lock = useRef(false)

  const load = useCallback(async () => {
    const permitted = await apiRequest('/international/hub/access')
    setAccess(permitted)
    if (!permitted.allowed) return
    const [currentConfig, list] = await Promise.all([
      apiRequest('/international/hub/config'),
      apiRequest(`/international/hub/shipments${includeAll ? '?include=all' : ''}`),
    ])
    setConfig(currentConfig)
    if (!Array.isArray(list)) throw new Error('The server returned an invalid inbound shipment list.')
    setShipments(list)
    if (permitted.role === 'admin') {
      const availableStores = await apiRequest('/international/hub/stores')
      setStores(Array.isArray(availableStores) ? availableStores : [])
    }
    if (list.some((shipment) => shipment.actions?.includes('dispatch'))) {
      const availableDrivers = await apiRequest('/international/hub/drivers')
      setDrivers(Array.isArray(availableDrivers) ? availableDrivers : [])
    }
  }, [includeAll])

  useEffect(() => {
    let current = true
    queueMicrotask(() => { if (current) load().catch((failure) => setError(failure.message)) })
    return () => { current = false }
  }, [load])

  function updateForm(key, patch) {
    setForms((previous) => ({ ...previous, [key]: { ...emptyForm(), ...previous[key], ...patch } }))
  }
  function updateCharge(key, index, patch) {
    const form = forms[key] || emptyForm()
    updateForm(key, { charges: form.charges.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row) })
  }

  async function run(action, successMessage = 'Inbound shipment updated.') {
    if (lock.current) return
    lock.current = true; setBusy(true); setError(''); setNotice('')
    try { await action(); await load(); setNotice(successMessage) }
    catch (failure) { setError(failure.message || 'Inbound shipment update failed.') }
    finally { lock.current = false; setBusy(false) }
  }

  async function perform(shipment, action) {
    const key = shipmentKey(shipment)
    const form = forms[key] || emptyForm()
    let data = {}
    if (action === 'arrive' || action === 'clear' || action === 'ready') data = { ...(form.note.trim() ? { note: form.note.trim() } : {}) }
    if (action === 'clear') {
      data.orderIds = pendingCustomsPackages(shipment).filter((pkg) => form.customsOrderIds.includes(pkg.orderId)).map((pkg) => pkg.orderId)
      if (!data.orderIds.length) throw new Error('Select at least one package collected from customs.')
    }
    if (action === 'reconcile') {
      data = { orderIds: form.reconcileOrderIds, note: form.note.trim() }
      if (!data.orderIds.length || !data.note) throw new Error('Select package records and explain how you verified them.')
    }
    if (action === 'charges') data = buildInternationalChargesPayload(form.charges, form.note)
    if (action === 'dispatch') {
      if (!form.driverId) throw new Error('Choose an active destination-region driver.')
      data = { driverId: form.driverId }
    }
    if (action === 'handover') {
      if (!form.note.trim()) throw new Error('Enter who collected the package and the ID check performed.')
      data = { note: form.note.trim(), ...(form.orderId ? { orderId: form.orderId } : {}) }
    }
    await apiRequest(`/international/hub/shipments/${encodeURIComponent(shipment.groupId)}/${encodeURIComponent(shipment.shipmentId)}/${action}`, {
      method: 'POST', body: JSON.stringify(data),
    })
    if (action === 'clear') updateForm(key, { customsOrderIds: [], note: '' })
    if (action === 'reconcile') updateForm(key, { reconcileOrderIds: [], note: '' })
  }

  async function saveHub() {
    if (!config?.config?.storeId) throw new Error('Choose an AdduGenet-owned hub store first.')
    const updated = await apiRequest('/international/hub/config', {
      method: 'PUT', body: JSON.stringify({ storeId: config.config.storeId }),
    })
    setConfig((previous) => ({ ...previous, config: updated }))
  }

  if (access && !access.allowed) return <section className="panel"><h1>Inbound hub access unavailable</h1>
    <p>This page is available only to Admin or the owner of the configured AdduGenet destination hub store.</p></section>

  return <section className="page-stack international-hub-page">
    {access?.role === 'admin' ? <AdminNavigation /> : null}
    <header className="panel"><p className="eyebrow">Destination region · {config?.destination || 'Inbound hub'}</p>
      <h1>International inbound hub</h1><p>Receive shipments, assess destination charges, clear customs and coordinate final delivery or collection.</p>
      {config?.config ? <p>Configured hub: <strong>{config.config.storeName}</strong>{config.config.storeAddress ? ` — ${config.config.storeAddress}` : ''}</p> : <p role="status">No inbound hub store configured yet.</p>}
    </header>
    {access?.role === 'admin' ? <article className="panel">
      <h2>Inbound hub configuration</h2>
      <label>AdduGenet company-owned store<select value={config?.config?.storeId || ''}
        onChange={(event) => setConfig((previous) => ({ ...previous, config: { ...(previous?.config || {}), storeId: event.target.value } }))}>
        <option value="">Choose approved company store</option>{stores.map((store) => <option value={store._id} key={store._id}>{store.name} — {[store.address, store.city].filter(Boolean).join(', ')}</option>)}
      </select></label>
      <button className="solid-button" disabled={busy || !config?.config?.storeId} onClick={() => run(saveHub, 'Inbound hub configuration saved.')}>Save hub store</button>
    </article> : null}
    {error ? <p className="error-text" role="alert">{error}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {!access ? <p role="status">Loading inbound hub access...</p> : null}
    {access?.allowed ? <section className="panel">
      <div className="panel-header"><h2>Inbound shipments</h2><label><input type="checkbox" checked={includeAll} onChange={(event) => setIncludeAll(event.target.checked)} /> Include delivered shipments</label></div>
      <button className="ghost-button" disabled={busy} onClick={() => run(async () => {}, 'Inbound shipments refreshed.')}>Refresh shipments</button>
      {shipments.length ? shipments.map((shipment) => {
        const key = shipmentKey(shipment)
        const form = forms[key] || emptyForm()
        const customsPackages = pendingCustomsPackages(shipment)
        const selectedCustomsIds = customsPackages.filter((pkg) => form.customsOrderIds.includes(pkg.orderId)).map((pkg) => pkg.orderId)
        const canCollect = shipment.actions?.includes('clear') && customsPackages.length > 0
        const pickupPackages = (shipment.packages || []).filter((item) => item.fulfillmentMethod === 'pickup' && !item.cancelled && !item.pickupConfirmation?.operatorAt)
        const charges = shipment.destination?.charges
        return <article className="order-card inbound-shipment" key={key}>
          <header className="international-shipment-heading"><div><p className="eyebrow">{shipment.direction} · {shipment.status}</p>
            <h3 className="international-tracking-code">{shipment.trackingCode || 'Tracking code unavailable'}</h3></div>
            <strong>{internationalStageLabel(shipment.destination?.stage)}</strong></header>
          <p>Customer: {shipment.customer?.name || 'Unknown'}{shipment.customer?.phone ? ` · ${shipment.customer.phone}` : ''}{shipment.customer?.email ? ` · ${shipment.customer.email}` : ''}</p>
          <p>Recipient: {shipment.recipient?.label || 'Recipient'} · {shipment.recipient?.phone || ''} · {[shipment.recipient?.address1, shipment.recipient?.city, shipment.recipient?.country].filter(Boolean).join(', ')}</p>
          <p>Hub: {shipment.destination?.hubStoreName || config?.config?.storeName || 'Not assigned'}</p>
          <section className="hub-steps"><h4>Hub steps</h4>
            <ol>{internationalHubSteps(shipment).map((step) => <li key={step.key} data-state={step.state}
              style={{ color: step.state === 'done' ? '#15803d' : step.state === 'current' ? '#1d4ed8' : '#6b7280', fontWeight: step.state === 'current' ? 700 : 400 }}>
              {step.state === 'done' ? '✓ ' : ''}{step.label}{step.hint ? ` — ${step.hint}` : ''}</li>)}</ol>
          </section>
          <h4>Packages ({shipment.packages?.length || 0})</h4>
          {shipment.packageIssue ? <p className="error-text">{shipment.packageIssue}</p> : null}
          {access.role === 'admin' && shipment.reconciliationRequired ? <div className="hub-action-form">
            <h4>Reconcile package records</h4>
            <p>Checkout #{shipment.groupId}. Verify the checkout and recipient before linking registered package records. This does not mark them collected from customs.</p>
            {(shipment.reconciliationCandidates || []).length ? <>
              {shipment.reconciliationCandidates.map((candidate) => <label key={candidate.orderId}>
                <input type="checkbox" disabled={busy} checked={form.reconcileOrderIds.includes(candidate.orderId)}
                  onChange={(event) => updateForm(key, { reconcileOrderIds: event.target.checked
                    ? [...form.reconcileOrderIds, candidate.orderId] : form.reconcileOrderIds.filter((orderId) => orderId !== candidate.orderId) })} />
                #{candidate.orderId} · {candidate.fulfillmentMethod} · {candidate.address || 'Address unavailable'}
                {' · '}{candidate.items.map((item) => `${item.quantity} × ${item.name}`).join(', ') || 'Items unavailable'}
              </label>)}
              <label>Verification note<input value={form.note} maxLength={300} onChange={(event) => updateForm(key, { note: event.target.value })} /></label>
              <button className="solid-button" disabled={busy || !form.reconcileOrderIds.length || !form.note.trim()}
                onClick={() => run(() => perform(shipment, 'reconcile'), 'Package records reconciled. Check the shipment before collecting from customs.')}>Link selected package records</button>
            </> : <p>No eligible registered package records found. Investigate the original checkout; restore records from a verified backup only if they are missing.</p>}
          </div> : null}
          {canCollect ? <button type="button" className="ghost-button" disabled={busy || selectedCustomsIds.length === customsPackages.length}
            onClick={() => updateForm(key, { customsOrderIds: customsPackages.map((pkg) => pkg.orderId) })}>Select all pending packages</button> : null}
          {(shipment.packages || []).map((pkg) => <div key={pkg.orderId} className="inbound-package">
            <strong>{pkg.fulfillmentMethod === 'pickup' ? 'Customer pickup' : 'Delivery'} · #{pkg.orderId}</strong>{pkg.cancelled ? <span> Cancelled</span> : null}
            <ul>{(pkg.items || []).map((item, index) => <li key={`${item.name}-${index}`}>{item.quantity} × {item.name}</li>)}</ul>
            {pkg.customsCollected ? <p>Collected from customs</p> : canCollect && !pkg.cancelled ? <label>
              <input type="checkbox" checked={selectedCustomsIds.includes(pkg.orderId)} disabled={busy}
                onChange={(event) => updateForm(key, { customsOrderIds: event.target.checked
                  ? [...selectedCustomsIds, pkg.orderId] : selectedCustomsIds.filter((orderId) => orderId !== pkg.orderId) })} />
              Select package #{pkg.orderId}
            </label> : null}
            {pkg.fulfillmentMethod === 'pickup' ? <p>Pickup confirmation: customer {pkg.pickupConfirmation?.customerAt ? 'confirmed' : 'pending'} · hub {pkg.pickupConfirmation?.operatorAt ? 'handed over' : 'pending'}</p> : null}
          </div>)}
          <section className="international-charges-panel"><h4>Destination charges</h4>
            {charges ? <><ul>{(charges.items || []).map((item, index) => <li key={`${item.type}-${index}`}><span>{internationalChargeLabel(item.type, item.label)}</span>
              <strong>{formatInternationalChargeAmount(item.amount, charges.currency)}</strong></li>)}</ul>
              <p>Total {formatInternationalChargeAmount(charges.total, charges.currency)} · {charges.status}{charges.method ? ` via ${charges.method}` : ''}</p>
            </> : <p>Not assessed</p>}
          </section>
          {(shipment.destination?.history || []).length ? <details><summary>Destination history</summary>
            {(shipment.destination.history || []).map((entry, index) => <p key={`${entry.stage}-${index}`}>{internationalStageLabel(entry.stage)} · {entry.at ? new Date(entry.at).toLocaleString() : ''}{entry.note ? ` · ${entry.note}` : ''}</p>)}
          </details> : null}
          {shipment.actions?.includes('arrive') ? <div className="hub-action-form">
            <label>Arrival note<input value={form.note} maxLength={300} onChange={(event) => updateForm(key, { note: event.target.value })} /></label>
            <button className="solid-button" disabled={busy} onClick={() => run(() => perform(shipment, 'arrive'))}>Mark arrived at hub / customs</button>
          </div> : null}
          {shipment.actions?.includes('charges') ? <div className="hub-action-form">
            <h4>Assess customs and related charges ({shipment.currency?.toUpperCase()})</h4>
            {form.charges.map((row, index) => <div className="hub-charge-row" key={index}>
              <label>Charge type<select value={row.type} onChange={(event) => updateCharge(key, index, { type: event.target.value, label: event.target.value === 'other' ? row.label : '' })}>
                {INTERNATIONAL_CHARGE_TYPES.map(([type, label]) => <option value={type} key={type}>{label}</option>)}
              </select></label>
              <label>Amount<input type="number" min="0" max="10000000" step="0.01" value={row.amount} onChange={(event) => updateCharge(key, index, { amount: event.target.value })} /></label>
              {row.type === 'other' ? <label>Required label<input maxLength={80} value={row.label} onChange={(event) => updateCharge(key, index, { label: event.target.value })} /></label> : null}
              <button type="button" className="ghost-button" disabled={busy} onClick={() => updateForm(key, { charges: form.charges.filter((_, rowIndex) => rowIndex !== index) })}>Remove row</button>
            </div>)}
            <button type="button" className="ghost-button" disabled={busy || form.charges.length >= 12} onClick={() => updateForm(key, { charges: [...form.charges, { type: 'customs_duty', amount: '', label: '' }] })}>Add charge row</button>
            <label>Assessment note<input value={form.note} maxLength={500} onChange={(event) => updateForm(key, { note: event.target.value })} /></label>
            <p>Leave every row amount empty or remove all rows to record no charges and waive payment.</p>
            <button className="solid-button" disabled={busy || form.charges.some((row) => row.type === 'other' && row.amount.trim() && !row.label.trim())}
              onClick={() => run(() => perform(shipment, 'charges'), 'Destination charges saved.')}>Save destination charges</button>
          </div> : null}
          {canCollect ? <div className="hub-action-form">
            <p>Select the packages you received. Release stays locked until all active packages are collected and charges are settled.</p>
            <label>Customs collection note<input value={form.note} maxLength={300} onChange={(event) => updateForm(key, { note: event.target.value })} /></label>
            <button className="solid-button" disabled={busy || !selectedCustomsIds.length}
              onClick={() => run(() => perform(shipment, 'clear'), 'Customs collection recorded.')}>Mark selected packages collected ({selectedCustomsIds.length})</button>
          </div> : null}
          {shipment.actions?.includes('ready') ? <div className="hub-action-form">
            <label>Ready note<input value={form.note} maxLength={300} onChange={(event) => updateForm(key, { note: event.target.value })} /></label>
            <button className="solid-button" disabled={busy} onClick={() => run(() => perform(shipment, 'ready'))}>Mark ready for delivery / pickup</button>
          </div> : null}
          {shipment.actions?.includes('dispatch') ? <div className="hub-action-form">
            <label>Available destination driver<select value={form.driverId} onChange={(event) => updateForm(key, { driverId: event.target.value })}>
              <option value="">Choose a driver</option>{drivers.filter((driver) => driver.isAvailable).map((driver) => <option key={driver._id} value={driver._id}>{driver.name} · {driver.vehicleType || 'Vehicle'}{driver.phone ? ` · ${driver.phone}` : ''}</option>)}
            </select></label>
            <button className="solid-button" disabled={busy || !form.driverId} onClick={() => run(() => perform(shipment, 'dispatch'))}>Dispatch driver</button>
          </div> : null}
          {shipment.actions?.includes('handover') ? <div className="hub-action-form">
            <label>Pickup package<select value={form.orderId} onChange={(event) => updateForm(key, { orderId: event.target.value })}>
              <option value="">All pending pickup packages</option>{pickupPackages.map((pkg) => <option key={pkg.orderId} value={pkg.orderId}>#{pkg.orderId}</option>)}
            </select></label>
            <label>Handover note (collector and ID checked)<input value={form.note} maxLength={300} onChange={(event) => updateForm(key, { note: event.target.value })} required /></label>
            <button className="solid-button" disabled={busy || !form.note.trim() || !pickupPackages.length} onClick={() => run(() => perform(shipment, 'handover'))}>Record pickup handover</button>
          </div> : null}
        </article>
      }) : <p>No inbound shipments match this view.</p>}
    </section> : null}
  </section>
}
