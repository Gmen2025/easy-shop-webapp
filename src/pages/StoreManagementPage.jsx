import { useState } from 'react'
import { deliveryRequest } from '../api/delivery'
import CompanyNavigation from '../components/CompanyNavigation'
import StoreLogoField from '../components/StoreLogoField'
import useCompanyResource, { useCompanyAction } from '../features/company/useCompanyResource'
import { inventoryPayload, requireList } from '../utils/company'
import { normalizeStoreLogo } from '../utils/storeLogo'
import { formatCurrency } from '../utils/format'

const locationsResponse = (data) => {
  requireList(data?.stores, 'store locations')
  if (typeof data.inventoryEnabled !== 'boolean') throw new Error('The server did not return inventory migration status.')
  return data
}
const catalogResponse = (data) => requireList(Array.isArray(data) ? data : data?.products, 'catalog products')
const inventoryResponse = (data) => requireList(data, 'store inventory')
const emptyProfile = { name: '', address: '', logo: '', description: '', latitude: '', longitude: '' }

export default function StoreManagementPage() {
  const locations = useCompanyResource('/stores/me/locations', locationsResponse)
  const catalog = useCompanyResource('/products', catalogResponse)
  const action = useCompanyAction()
  const [selectedId, setSelectedId] = useState('')
  const selected = locations.data?.stores.find((store) => store._id === selectedId) || locations.data?.stores[0]
  return <section className="page-stack company-console company-store"><CompanyNavigation />
    <article className="panel"><h1>My store & inventory</h1>
      <button className="ghost-button" disabled={locations.loading || catalog.loading}
        onClick={() => action.run(() => Promise.all([locations.reload(), catalog.reload()]))}>Refresh store data</button>
      {locations.error || catalog.error || action.error ? <p role="alert">{locations.error || catalog.error || action.error}</p> : null}
      {locations.loading && !locations.data ? <p role="status">Loading locations...</p> : null}
      {locations.data?.stores.length === 0 ? <p>No store profile is linked to your account. Contact Admin.</p> : null}
      {locations.data && !locations.data.inventoryEnabled ? <p role="status">Admin must migrate inventory before store stock can be edited.</p> : null}
      {selected ? <label>Store location<select value={selected._id} onChange={(event) => setSelectedId(event.target.value)}>
        {locations.data.stores.map((store) => <option key={store._id} value={store._id}>{store.name}</option>)}
      </select></label> : null}
    </article>
    {selected ? <StoreLocation key={`${selected._id}:${selected.updatedAt || ''}`} store={selected}
      root={locations.data.stores.find((store) => !store.parentStore)} catalog={catalog.data || []}
      inventoryEnabled={locations.data.inventoryEnabled} onSaved={async (id) => { await locations.reload(); setSelectedId(id) }} /> : null}
  </section>
}

function StoreLocation({ store, root, catalog, inventoryEnabled, onSaved }) {
  const inventory = useCompanyResource(`/stores/me/locations/${encodeURIComponent(store._id)}/inventory`, inventoryResponse)
  const action = useCompanyAction()
  const [creatingBranch, setCreatingBranch] = useState(false)
  const initialProfile = {
    name: store.name, address: store.address, description: store.description || '', logo: store.logo || '',
    latitude: String(store.location?.coordinates?.[1] ?? ''), longitude: String(store.location?.coordinates?.[0] ?? ''),
  }
  const [profile, setProfile] = useState(initialProfile)
  const [logoBusy, setLogoBusy] = useState(false)
  const [category, setCategory] = useState('')
  const [productId, setProductId] = useState('')
  const [stock, setStock] = useState({ price: '', countInStock: '', minStock: '5' })
  const categories = [...new Map(catalog.filter((item) => item.category?._id).map((item) => [item.category._id, item.category])).values()]
  const chooseProduct = (id) => {
    setProductId(id)
    const row = inventory.data?.find((entry) => entry.product?._id === id)
    const product = catalog.find((entry) => entry._id === id)
    if (category && product?.category?._id !== category) setCategory('')
    setStock({ price: String(row?.price ?? product?.price ?? ''), countInStock: String(row?.countInStock ?? 0), minStock: String(row?.minStock ?? 5) })
  }
  const saveProfile = (event) => {
    event.preventDefault()
    action.run(async () => {
      const payload = { ...profile, logo: normalizeStoreLogo(profile.logo) }
      if (!profile.name.trim() || !profile.address.trim()) throw new Error('Store name and address are required.')
      const latitude = Number(profile.latitude), longitude = Number(profile.longitude)
      if (!profile.latitude.trim() || !profile.longitude.trim() || !Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180) {
        throw new Error('Enter a valid latitude (-90 to 90) and longitude (-180 to 180).')
      }
      if (creatingBranch && !root) throw new Error('No parent store is available for this branch. Contact Admin.')
      const updated = await deliveryRequest(creatingBranch ? `me/locations/${root._id}/branches` : `me/locations/${store._id}`,
        { method: creatingBranch ? 'POST' : 'PUT', data: payload })
      if (!updated?._id) throw new Error('The server did not return the saved store. Refresh before retrying.')
      setCreatingBranch(false)
      await onSaved(updated._id)
    }, 'Your storefront profile is updated.')
  }
  const busy = action.busy || logoBusy
  return <>
    {action.error || inventory.error ? <p className="form-error" role="alert">{action.error || inventory.error}</p> : null}
    {action.notice ? <p role="status">{action.notice}</p> : null}
    <article className="panel"><p>Store ID: {store._id}</p><h2>{creatingBranch ? 'New branch' : 'Store profile'}</h2>
      <form className="form-grid" onSubmit={saveProfile}>
        <StoreLogoField name={profile.name} value={profile.logo} disabled={action.busy} onBusyChange={setLogoBusy}
          onChange={(logo) => setProfile((current) => ({ ...current, logo }))} />
        {['name', 'address', 'description', 'latitude', 'longitude'].map((field) => <label key={field}>
          {({ name: 'Store name', address: 'Address', description: 'Description', latitude: 'Latitude', longitude: 'Longitude' })[field]}
          <input value={profile[field]} required={field !== 'description'} disabled={busy} maxLength={field === 'description' ? 2000 : 300}
            onChange={(event) => setProfile((current) => ({ ...current, [field]: event.target.value }))} />
        </label>)}
        <div className="action-row"><button className="solid-button" disabled={busy}>Save profile</button>
          {!creatingBranch ? <button type="button" className="ghost-button" disabled={busy || !root}
            onClick={() => { setCreatingBranch(true); setProfile(emptyProfile) }}>Add a branch</button> :
            <button type="button" className="ghost-button" disabled={busy} onClick={() => { setCreatingBranch(false); setProfile(initialProfile) }}>Cancel branch</button>}
        </div>
      </form>
    </article>
    <article className="panel"><h2>Add or adjust a catalog product</h2>
      <p>Categories and shared products are managed by Admin. Stock includes reservations.</p>
      <form className="form-grid" onSubmit={(event) => {
        event.preventDefault()
        action.run(async () => {
          const payload = inventoryPayload(stock)
          await deliveryRequest(`me/locations/${store._id}/inventory/${productId}`, { method: 'PUT', data: payload })
          await inventory.reload()
        }, 'Store stock and price updated.')
      }}>
        <label>Category<select value={category} disabled={busy} onChange={(event) => { setCategory(event.target.value); setProductId('') }}>
          <option value="">All existing categories</option>{categories.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
        </select></label>
        <label>Catalog product<select value={productId} disabled={busy || inventory.loading} onChange={(event) => chooseProduct(event.target.value)}>
          <option value="">Select catalog product</option>{catalog.filter((item) => !category || item.category?._id === category)
            .map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
        </select></label>
        {productId ? <>
          {[['price', 'Store price'], ['countInStock', 'Physical stock (including reservations)'], ['minStock', 'Low-stock threshold']].map(([field, label]) =>
            <label key={field}>{label}<input type="number" min="0" step={field === 'price' ? '0.01' : '1'} required
              disabled={busy || !inventoryEnabled} value={stock[field]} onChange={(event) => setStock((current) => ({ ...current, [field]: event.target.value }))} /></label>)}
          <button className="solid-button" disabled={busy || !inventoryEnabled || inventory.loading || Boolean(inventory.error)}>Save inventory</button>
        </> : null}
      </form>
    </article>
    <article className="panel"><h2>Your store products</h2>
      {inventory.loading && !inventory.data ? <p role="status">Loading inventory...</p> : null}
      {inventory.data?.length === 0 ? <p>No products listed at this store.</p> : null}
      <div className="company-card-grid">{inventory.data?.map((row) => <article className="order-card" key={row._id}>
        <h3>{row.product?.name || 'Removed catalog product'}</h3>
        <p>{formatCurrency(row.price)} | Physical: {row.countInStock} | Reserved: {row.reserved}</p>
        <p className={row.countInStock - row.reserved <= row.minStock ? 'company-warning' : ''}>
          Available: {row.countInStock - row.reserved}{row.countInStock - row.reserved <= row.minStock ? ' - Low stock' : ''}</p>
        <div className="action-row"><button className="ghost-button" disabled={busy || !row.product} onClick={() => chooseProduct(row.product._id)}>Adjust inventory</button>
          <button className="danger-button" disabled={busy || !inventoryEnabled || !row.product} onClick={() => {
            if (window.confirm('Remove this listing from this location only? The shared catalog product will not be deleted.')) action.run(async () => {
              await deliveryRequest(`me/locations/${store._id}/inventory/${row.product._id}`, { method: 'DELETE' })
              setProductId('')
              await inventory.reload()
            }, 'Product removed from this store.')
          }}>Remove from store</button></div>
      </article>)}</div>
    </article>
  </>
}
