import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { Link, useParams } from 'react-router-dom'
import { apiRequest, getSelectedDatabaseName } from '../api/client'
import { createAdminOperations, filterPayouts, OPERATION_SECTIONS, scheduledDeliveryLabel } from '../utils/adminOperations'
import StoreLogo from '../components/StoreLogo'
import StoreLogoField from '../components/StoreLogoField'

function useOperationTask() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const guard = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  const run = useCallback(async (action) => {
    if (guard.current) return
    guard.current = true
    setBusy(true); setError(''); setMessage('')
    try {
      const result = await action()
      if (mounted.current && result) setMessage(result)
    } catch (failure) {
      if (mounted.current) setError(failure.message || 'Operation failed.')
    } finally {
      guard.current = false
      if (mounted.current) setBusy(false)
    }
  }, [])
  return { busy, error, message, run }
}

function Feedback({ task }) {
  return <>{task.busy && <p role="status">Working…</p>}
    {task.error && <p role="alert">{task.error}</p>}
    {task.message && <p role="status">{task.message}</p>}</>
}

function RecordDetails({ item, driver = false, database }) {
  const currency = item.currency || (/usa/i.test(item.databaseName || database) ? 'USD' : 'ETB')
  const deposit = item.depositBalance ?? item.driverDepositBalance ?? item.availableBalance ?? item.walletBalance ?? item.balance
  return <>
    {!driver && <StoreLogo name={item.name} logo={item.logo} />}
    <h3>{item.name}</h3><p>{item.email} {item.phone}</p><p>{item.address}</p>
    <p>Approval: {item.approvalStatus || 'approved'}{driver && ` · ${item.isAvailable || item.availabilityStatus ? 'Available' : 'Unavailable'}`}</p>
    {driver && <p>Vehicle: {item.vehicle?.type || item.vehicleType || 'Not specified'} {item.vehicle?.year} {item.vehicle?.make} {item.vehicle?.model}</p>}
    {driver && <p>Deposit: {deposit == null ? 'Not reported' : `${deposit} ${currency}`}</p>}
    {item.isSuspended && <p>Suspended: {item.suspensionReason || 'No reason recorded'}</p>}
    {item.location?.coordinates && <p>Latitude: {item.location.coordinates[1]}, longitude: {item.location.coordinates[0]}</p>}
    {item.databaseName && <p>Region: {item.databaseName}</p>}
  </>
}

function AccessButtons({ item, resource, api, task, reload }) {
  const driver = resource === 'drivers'
  const status = item.approvalStatus || 'approved'
  const act = (action, label) => {
    if (!window.confirm(`${label} "${item.name}"? ${action === 'recover' ? 'This returns the application to pending approval.' : ''}
${action === 'reinstate' ? 'Removes suspension and enables availability; approval and delivery capacity rules still apply.' : ''}`)) return
    task.run(async () => {
      await api.access(resource, item, action)
      await reload()
      return `${label} completed.`
    })
  }
  return <div className="button-row">
    {status !== 'approved' && <button type="button" onClick={() => act('approve', 'Approve access')}>Approve</button>}
    {status === 'denied' && <button type="button" onClick={() => act('recover', 'Recover application')}>Recover to pending</button>}
    {status !== 'denied' && <button type="button" onClick={() => act('deny', 'Deny access')}>Deny</button>}
    {driver && (item.isSuspended
      ? <button type="button" onClick={() => act('reinstate', 'Reinstate driver')}>Reinstate / unsuspend</button>
      : <button type="button" onClick={() => act('suspend', 'Suspend driver')}>Suspend</button>)}
    <button type="button" onClick={() => {
      if (!window.confirm(`Permanently delete "${item.name}" and remove its linked role/access? This cannot be undone.`)) return
      task.run(async () => { await api.remove(resource, item); await reload(); return 'Record deleted.' })
    }}>Delete</button>
  </div>
}

const emptyCompany = {
  name: '', email: '', phone: '', password: '', vehicleType: '', country: 'Ethio',
  logo: '',
  address1: '', address2: '', city: '', zip: '', address: '', latitude: '', longitude: '',
}

function CompanyForm({ driver, record, api, reload, onClose }) {
  const [form, setForm] = useState(() => record ? {
    ...emptyCompany, ...Object.fromEntries(['name', 'email', 'phone', 'address', 'vehicleType', 'logo'].map((key) => [key, record[key] || ''])),
    latitude: record.location?.coordinates?.[1] ?? '', longitude: record.location?.coordinates?.[0] ?? '',
  } : { ...emptyCompany })
  const task = useOperationTask()
  const [logoBusy, setLogoBusy] = useState(false)
  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const input = (key, label, type = 'text', required = true) => <label key={key}>{label}
    <input type={type} required={required} value={form[key]} autoComplete={key === 'password' ? 'new-password' : 'off'}
      {...(type === 'number' ? { step: 'any', min: key === 'latitude' ? -90 : -180, max: key === 'latitude' ? 90 : 180 } : {})}
      onChange={(event) => change(key, event.target.value)} /></label>
  return <article className="order-card">
    <h2>{record ? 'Edit' : 'Create'} company {driver ? 'driver' : 'store'}</h2>
    <Feedback task={task} />
    <form onSubmit={(event) => {
      event.preventDefault()
      if (logoBusy || task.busy) return
      if (!window.confirm(record ? `Update "${record.name}"? Email/password changes also affect the linked sign-in account.`
        : 'Create this company account? If the email already exists, its role may be updated.')) return
      task.run(async () => {
        await api.saveCompany(driver ? 'drivers' : 'stores', form, record)
        setForm({ ...emptyCompany })
        await reload()
        if (record) onClose()
        return 'Company account saved.'
      })
    }}>
      <fieldset disabled={task.busy || logoBusy}>
        <div className="form-grid">
          {input('name', 'Name')}{input('email', 'Email', 'email')}{input('phone', 'Phone', 'tel')}
          {input('password', record ? 'New password (leave blank to retain)' : 'Password', 'password', !record)}
          {driver && input('vehicleType', 'Vehicle type (optional)', 'text', false)}
          {record ? input('address', 'Address', 'text', !driver) : <>
            <label>Country<select value={form.country} onChange={(event) => change('country', event.target.value)}>
              <option value="Ethio">Ethiopia</option><option value="USA">USA</option>
            </select></label>
            {input('address1', 'Address line 1')}{input('address2', 'Address line 2 (optional)', 'text', false)}
            {input('city', 'City')}{form.country === 'USA' && input('zip', 'ZIP code')}
          </>}
          {input('latitude', 'Latitude', 'number', !record)}{input('longitude', 'Longitude', 'number', !record)}
        </div>
        {!driver && <StoreLogoField name={form.name} value={form.logo} onChange={(value) => change('logo', value)}
          disabled={task.busy} onBusyChange={setLogoBusy} />}
        <p>Use the account location, not necessarily this computer. Coordinates can be entered manually.</p>
        <button type="button" onClick={() => task.run(async () => {
          if (!navigator.geolocation) throw new Error('Geolocation is unavailable. Enter coordinates manually.')
          const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 15000 }))
          setForm((current) => ({ ...current, latitude: position.coords.latitude, longitude: position.coords.longitude }))
          return 'Current device coordinates selected.'
        })}>Use current location</button>
        <button className="solid-button" type="submit">{record ? 'Save changes' : 'Create account'}</button>
        {record && <button type="button" onClick={onClose}>Cancel edit</button>}
      </fieldset>
    </form>
  </article>
}

function FulfillmentDetails({ item, driver }) {
  const scheduled = item.scheduledFor || item.scheduledDeliveryDate || item.scheduledDate ||
    item.rawPayload?.scheduledDeliveryDate || item.rawPayload?.scheduledFor
  return <><h3>{driver ? `Order ${item._id || item.id}` : item.name}</h3>
    {driver ? <><p>Store: {item.store?.name || 'No store'}</p>
      {(scheduled || item.deliveryMode === 'SCHEDULED') && <p>Scheduled delivery: {scheduledDeliveryLabel(item)}</p>}</>
      : <p>Stock: {item.countInStock ?? 'Not reported'} · Price: {item.price ?? 'Not reported'}</p>}</>
}

function CompanyOperations({ driver, api, database }) {
  const [records, setRecords] = useState(null)
  const [queue, setQueue] = useState(null)
  const [rejections, setRejections] = useState(null)
  const [nearby, setNearby] = useState(null)
  const [editing, setEditing] = useState(null)
  const [defaultStoreId, setDefaultStoreId] = useState('')
  const [queueFilter, setQueueFilter] = useState('all')
  const task = useOperationTask()
  const { run } = task
  const resource = driver ? 'drivers' : 'stores'
  const fulfillment = driver ? 'orders' : 'products'
  const reload = useCallback(async () => {
    const results = await Promise.allSettled([
      api.list(`/${resource}/admin/company-${resource}`),
      api.list(`/${fulfillment}/admin/company-rejections`, fulfillment),
      ...(driver ? [api.list('/drivers')] : []),
    ])
    setRecords(results[0].status === 'fulfilled' ? results[0].value : null)
    setRejections(results[1].status === 'fulfilled' ? results[1].value : null)
    if (driver) setQueue(results[2].status === 'fulfilled' ? results[2].value : null)
    const failed = results.filter((result) => result.status === 'rejected')
    if (failed.length) throw new Error(failed.map((result) => result.reason.message).join(' '))
  }, [api, resource, fulfillment, driver])
  useEffect(() => { run(reload) }, [reload, run])
  return <>
    <Feedback task={task} />
    <button disabled={task.busy} onClick={() => task.run(reload)}>Refresh operations</button>
    <CompanyForm key={editing?._id || editing?.id || 'create'} driver={driver} record={editing}
      api={api} reload={reload} onClose={() => setEditing(null)} />
    <fieldset disabled={task.busy}>
      {!driver && <article className="order-card">
        <h2>Enable store-level inventory (one-time migration)</h2>
        <p>Complete or cancel active orders first. Existing stock moves to linked stores; unlinked products move to the default store. Quantities are not copied to every store.</p>
        <label>Default company store<select value={defaultStoreId} onChange={(event) => setDefaultStoreId(event.target.value)}>
          <option value="">Select a store</option>{records?.map((item) => <option key={item._id || item.id} value={item._id || item.id}>{item.name}</option>)}
        </select></label>
        <button disabled={!defaultStoreId} onClick={() => {
          if (!window.confirm(`Migrate existing inventory once in ${database}? This changes stock ownership and fulfillment behavior.`)) return
          task.run(async () => {
            const result = await api.migrate(defaultStoreId)
            if (!Number.isInteger(result.products)) throw new Error('Migration response omitted the product count. Check backend state before retrying.')
            await reload()
            return `${result.products} catalog products migrated.`
          })
        }}>Migrate existing inventory</button>
      </article>}
      <h2>Company {driver ? 'drivers' : 'stores'}</h2>
      {records === null ? <p>Company list not loaded.</p> : records.length === 0 ? <p>No company accounts.</p> : records.map((item) =>
        <article className="order-card" key={item._id || item.id}>
          <RecordDetails item={item} driver={driver} database={database} />
          <button onClick={() => setEditing(item)}>Edit account</button>
          <button onClick={() => task.run(async () => {
            setNearby(null)
            const items = await api.nearby(fulfillment, item)
            setNearby({ name: item.name, items })
          })}>Nearby unassigned {driver ? 'deliveries' : 'products'} (10 km)</button>
          {driver && !item.isSuspended && item.approvalStatus === 'approved' && !item.isAvailable && !item.availabilityStatus &&
            <button onClick={() => task.run(async () => { await api.availability(item); await reload(); return 'Availability enabled.' })}>Enable availability</button>}
          <AccessButtons item={item} resource={resource} api={api} task={task} reload={reload} />
        </article>)}
      {nearby && <article className="order-card"><h2>Unassigned near {nearby.name}</h2>
        <button onClick={() => setNearby(null)}>Close nearby results</button>
        {!nearby.items.length && <p>No uncovered {fulfillment} nearby.</p>}
        {nearby.items.map((item) => <div key={item._id || item.id}><FulfillmentDetails item={item} driver={driver} /></div>)}
      </article>}
      <h2>Rejected {driver ? 'delivery' : 'product'} requests</h2>
      {rejections === null ? <p>Rejections not loaded.</p> : rejections.length === 0 ? <p>No rejected requests.</p> : rejections.map((item) =>
        <article className="order-card" key={item._id || item.id}>
          <FulfillmentDetails item={item} driver={driver} />
          {(item[driver ? 'companyDriverResponses' : 'companyStoreResponses'] || []).filter((entry) => entry.status === 'rejected').map((entry) =>
            <div key={entry._id || entry.id}><p>Rejected by {entry[driver ? 'driver' : 'store']?.name || 'Company account'}</p>
              <button onClick={() => {
                if (!window.confirm('Delete this rejection and reopen this request?')) return
                task.run(async () => { await api.removeRejection(fulfillment, item, entry); await reload(); return 'Rejection removed; request reopened.' })
              }}>Remove rejection / reopen</button>
            </div>)}
        </article>)}
      {driver && <>
        <h2>All registered drivers / onboarding queue</h2>
        <label>Filter applications<select value={queueFilter} onChange={(event) => setQueueFilter(event.target.value)}>
          {['all', 'pending', 'approved', 'denied', 'suspended'].map((value) => <option key={value}>{value}</option>)}
        </select></label>
        {queue === null ? <p>Driver queue not loaded.</p> : (() => {
          const filtered = queue.filter((item) => queueFilter === 'all' || (queueFilter === 'suspended' ? item.isSuspended : (item.approvalStatus || 'approved') === queueFilter))
          return filtered.length ? filtered.map((item) => <article className="order-card" key={item._id || item.id}>
            <RecordDetails item={item} driver database={database} />
            <AccessButtons item={item} resource="drivers" api={api} task={task} reload={reload} />
          </article>) : <p>No matching drivers.</p>
        })()}
      </>}
    </fieldset>
  </>
}

function OwnerOperations({ api, database }) {
  const [owners, setOwners] = useState(null)
  const [filter, setFilter] = useState('all')
  const task = useOperationTask()
  const { run } = task
  const reload = useCallback(async () => { setOwners(await api.list('/stores/admin/owners')) }, [api])
  useEffect(() => { run(reload) }, [reload, run])
  const filtered = owners?.filter((item) => filter === 'all' || (item.approvalStatus || 'approved') === filter)
  return <><Feedback task={task} /><fieldset disabled={task.busy}>
    <button onClick={() => task.run(reload)}>Refresh store owners</button>
    <p><Link to="/admin/operations/payouts">Manage payouts</Link></p>
    <label>Application status<select value={filter} onChange={(event) => setFilter(event.target.value)}>
      {['all', 'pending', 'approved', 'denied'].map((value) => <option key={value}>{value}</option>)}
    </select></label>
    {!owners ? <p>Store owners not loaded.</p> : !filtered.length ? <p>No matching store owners.</p> : filtered.map((item) =>
      <article className="order-card" key={item._id || item.id}><RecordDetails item={item} database={database} />
        <AccessButtons item={item} resource="stores" api={api} task={task} reload={reload} />
      </article>)}
  </fieldset></>
}

function RoleOperations({ api, database }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('driver')
  const task = useOperationTask()
  return <><p>Grant access to an existing registered user in {database}. This approves their selected role.</p>
    <Feedback task={task} /><form className="form-grid" onSubmit={(event) => {
      event.preventDefault()
      if (!window.confirm(`Grant approved ${role} access to ${email.trim().toLowerCase()} in ${database}?`)) return
      task.run(async () => { await api.assignRole(email, role); setEmail(''); return 'Role assigned.' })
    }}><fieldset disabled={task.busy}>
      <label>User email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>Role<select value={role} onChange={(event) => setRole(event.target.value)}>
        <option value="driver">Driver</option><option value="store_owner">Store owner</option>
      </select></label><button className="solid-button">Assign role</button>
    </fieldset></form></>
}

function PayoutOperations({ api, database }) {
  const [payouts, setPayouts] = useState(null)
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState(null)
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const task = useOperationTask()
  const { run } = task
  const reload = useCallback(async () => { setPayouts(await api.list('/stores/admin/payouts')) }, [api])
  useEffect(() => { run(reload) }, [reload, run])
  return <><Feedback task={task} /><fieldset disabled={task.busy}>
    <button onClick={() => task.run(reload)}>Refresh payouts</button>
    <p>These operations record settlements, not bank transfers. Transfer funds separately and use the real transaction reference. Weekly batch immediately records available balances as paid.</p>
    <button onClick={() => {
      if (!window.confirm(`Generate weekly settlements for all active stores in ${database} and mark them PAID? Confirm external payment arrangements first.`)) return
      task.run(async () => {
        const result = await api.batch()
        if (!Number.isInteger(result.totalPayouts)) throw new Error('Batch response omitted payout count. Check backend state before retrying.')
        await reload()
        return `${result.totalPayouts} weekly payouts recorded as paid.`
      })
    }}>Process weekly batch (mark paid)</button>
    <label>Filter payouts<select value={filter} onChange={(event) => setFilter(event.target.value)}>
      {['all', 'pending', 'paid', 'early', 'weekly'].map((value) => <option key={value}>{value}</option>)}
    </select></label>
    <p>Pending / processing: {payouts ? filterPayouts(payouts, 'pending').length : 'Not loaded'}</p>
    {payouts === null ? <p>Payouts not loaded.</p> : filterPayouts(payouts, filter).length === 0 ? <p>No matching payouts.</p>
      : filterPayouts(payouts, filter).map((item) => <article className="order-card" key={`${item.databaseName || database}-${item._id || item.id}`}>
        <h2>{item.store?.name || 'Unknown store'}</h2><p>{item.store?.phone} {item.store?.email}</p>
        <p>{item.amount} {item.currency || (/usa/i.test(item.databaseName || database) ? 'USD' : 'ETB')} · {item.status} · {item.payoutType}</p>
        <p>Account: {typeof (item.accountDetails || item.store?.bankAccount) === 'object'
          ? JSON.stringify(item.accountDetails || item.store?.bankAccount) : item.accountDetails || item.store?.bankAccount || item.store?.phone || 'No account details'}</p>
        <p>Method: {item.method || 'Not reported'} · Region: {item.databaseName || database}</p>
        <p>Requested: {item.dateRequested ? new Date(item.dateRequested).toLocaleString() : 'Not reported'}
          {item.dateProcessed && ` · Processed: ${new Date(item.dateProcessed).toLocaleString()}`}</p>
        {item.reference && <p>Reference: {item.reference}</p>}{item.adminNotes && <p>Admin notes: {item.adminNotes}</p>}
        {['pending', 'processing'].includes(item.status) && ['paid', 'rejected'].map((status) =>
          <button key={status} onClick={() => { setSelected({ item, status }); setReference(item.reference || ''); setNotes(item.adminNotes || '') }}>
            {status === 'paid' ? 'Mark paid' : 'Reject'}
          </button>)}
      </article>)}
    {selected && <article className="order-card"><h2>Mark payout {selected.status}: {selected.item.store?.name}</h2>
      <form className="form-grid" onSubmit={(event) => {
        event.preventDefault()
        if (!window.confirm(`Mark payout ${selected.item._id || selected.item.id} (${selected.item.amount} ${selected.item.currency || ''}) as ${selected.status}?`)) return
        task.run(async () => {
          await api.payout(selected.item, selected.status, reference, notes)
          setSelected(null); await reload()
          return 'Payout updated.'
        })
      }}>
        <label>Transaction reference<input value={reference} onChange={(event) => setReference(event.target.value)} /></label>
        <label>Admin notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        <button className="solid-button">Confirm {selected.status}</button><button type="button" onClick={() => setSelected(null)}>Cancel</button>
      </form>
    </article>}
  </fieldset></>
}

function BroadcastOperations({ api, database }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const task = useOperationTask()
  return <><p>Send to customer devices with registered Expo push tokens in {database}. Browser notifications and guaranteed device delivery are not supported by this endpoint.</p>
    <Feedback task={task} /><form className="form-grid" onSubmit={(event) => {
      event.preventDefault()
      if (!window.confirm(`Broadcast "${title.trim()}" to all registered customer devices in ${database}?`)) return
      task.run(async () => {
        const result = await api.broadcast(title, body)
        if (!result.startsWith('No active recipients')) { setTitle(''); setBody('') }
        return result
      })
    }}><fieldset disabled={task.busy}>
      <label>Title (80 characters)<input required maxLength={80} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label>Message (240 characters)<textarea required maxLength={240} value={body} onChange={(event) => setBody(event.target.value)} /></label>
      <button className="solid-button">Send broadcast</button>
    </fieldset></form></>
}

export default function AdminOperationsPage({ section: sectionProp }) {
  const params = useParams()
  const user = useSelector((state) => state.auth.user)
  const section = sectionProp || params.section || 'stores'
  const database = getSelectedDatabaseName()
  const api = useMemo(() => createAdminOperations(apiRequest, database), [database])
  if (!user?.isAdmin) return <section className="panel"><h1>Admin operations</h1><p role="alert">Administrator access is required.</p></section>
  if (!Object.hasOwn(OPERATION_SECTIONS, section)) return <section className="panel"><h1>Unknown operations section</h1><Link to="/admin">Admin dashboard</Link></section>
  return <section className="panel">
    <div className="panel-header"><h1>{OPERATION_SECTIONS[section]}</h1><Link to="/admin">Admin dashboard</Link></div>
    <nav aria-label="Admin operations" className="button-row">{Object.entries(OPERATION_SECTIONS).map(([key, label]) =>
      <Link key={key} to={`/admin/operations/${key}`} aria-current={section === key ? 'page' : undefined}>{label}</Link>)}</nav>
    <p>Selected region: {database}. Changes are shared with mobile.</p>
    <div key={`${section}-${database}`}>
      {['stores', 'drivers'].includes(section) && <CompanyOperations driver={section === 'drivers'} api={api} database={database} />}
      {section === 'store-owners' && <OwnerOperations api={api} database={database} />}
      {section === 'roles' && <RoleOperations api={api} database={database} />}
      {section === 'payouts' && <PayoutOperations api={api} database={database} />}
      {section === 'broadcast' && <BroadcastOperations api={api} database={database} />}
    </div>
  </section>
}
