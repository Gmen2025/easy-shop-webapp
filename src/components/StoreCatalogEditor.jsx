import { useState } from 'react'
import { deliveryRequest } from '../api/delivery'
import { uploadProductImages } from '../api/uploads'
import { useCompanyAction } from '../features/company/useCompanyResource'
import { catalogNotificationWarnings, entityId, ownedByStore, ownerProductPayload } from '../utils/catalogPricing'

const emptyProduct = {
  name: '', brand: '', description: '', richDescription: '', category: '',
  price: '', countInStock: '0', minStock: '5', images: [],
}
const emptyCategory = { name: '', icon: '', color: '#f29a43' }

export default function StoreCatalogEditor({ store, catalog, categories, inventory, disabled, onSaved }) {
  const action = useCompanyAction()
  const [form, setForm] = useState(emptyProduct)
  const [editing, setEditing] = useState('')
  const [files, setFiles] = useState([])
  const [imageUrl, setImageUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [category, setCategory] = useState(emptyCategory)
  const [categoryId, setCategoryId] = useState('')
  const [warnings, setWarnings] = useState([])
  const ownProducts = catalog.filter((product) => ownedByStore(product, store))
  const ownCategories = categories.filter((entry) => ownedByStore(entry, store))
  const busy = action.busy || uploading || disabled
  const base = `me/locations/${encodeURIComponent(entityId(store))}`
  const change = (field, value) => setForm((current) => ({ ...current, [field]: value }))
  const reset = () => {
    setForm(emptyProduct); setEditing(''); setFiles([]); setImageUrl(''); setUploadError('')
  }
  const refresh = async () => {
    try { await onSaved() }
    catch (failure) { throw new Error(`Your change was saved, but refreshing failed: ${failure.message}. Use Refresh inventory & catalog before making another change.`, { cause: failure }) }
  }
  const edit = (product) => {
    const stock = inventory.find((row) => entityId(row.product) === entityId(product))
    reset()
    setEditing(entityId(product))
    setForm({
      name: product.name || '', brand: product.brand || '', description: product.description || '',
      richDescription: product.richDescription || '', category: entityId(product.category),
      price: String(stock?.price ?? product.price ?? ''), countInStock: String(stock?.countInStock ?? product.countInStock ?? 0),
      minStock: String(stock?.minStock ?? 5),
      images: [...new Set([...(product.images || []), product.image].filter(Boolean))],
    })
  }
  const upload = async () => {
    setUploading(true); setUploadError('')
    try {
      const images = await uploadProductImages(files)
      setForm((current) => ({ ...current, images: [...new Set([...current.images, ...images])] }))
      setFiles([])
    } catch (failure) { setUploadError(failure.message) }
    finally { setUploading(false) }
  }
  return <article className="panel page-stack">
    <h2>Create & manage your own catalog products</h2>
    <p>New products publish immediately with this store’s inventory. Admin can still edit or delete them. Shared products from Admin or other stores may be listed and stocked above, but cannot be edited or deleted here.</p>
    {action.error || uploadError ? <p className="form-error" role="alert">{action.error || uploadError}</p> : null}
    {action.notice ? <p role="status">{action.notice}</p> : null}
    {warnings.map((warning, index) => <p role="alert" key={index}>{warning}</p>)}
    <form className="form-grid" onSubmit={(event) => {
      event.preventDefault()
      action.run(async () => {
        if (editing && !ownProducts.some((product) => entityId(product) === editing)) throw new Error('You can only edit products created by this store.')
        if (!categories.some((entry) => entityId(entry) === form.category)) throw new Error('Select an existing shared category or create one below.')
        const payload = ownerProductPayload(form)
        const result = await deliveryRequest(`${base}/products${editing ? `/${encodeURIComponent(editing)}` : ''}`,
          { method: editing ? 'PUT' : 'POST', data: payload })
        if (!entityId(result)) throw new Error('The server did not return the saved product. Refresh store data before retrying.')
        setWarnings(catalogNotificationWarnings(result))
        reset()
        await refresh()
      }, editing ? 'Your product and inventory were updated.' : 'Your product is published.')
    }}>
      <h3>{editing ? 'Edit your product' : 'Publish a new product'}</h3>
      {[
        ['name', 'Product name'], ['brand', 'Brand'], ['description', 'Description'], ['richDescription', 'Detailed description'],
      ].map(([field, label]) => <label key={field}>{label}
        <input value={form[field]} required={['name', 'description'].includes(field)} disabled={busy}
          onChange={(event) => change(field, event.target.value)} />
      </label>)}
      <label>Category (all stores and company)<select required disabled={busy} value={form.category}
        onChange={(event) => change('category', event.target.value)}>
        <option value="">Select an existing category</option>
        {categories.map((entry) => <option key={entityId(entry)} value={entityId(entry)}>{entry.name}</option>)}
      </select></label>
      <p>Check all shared categories first. If yours is missing, create it below; equivalent names reuse the existing category.</p>
      {[['price', 'Store price'], ['countInStock', 'Physical stock (includes reservations)'], ['minStock', 'Low-stock threshold']].map(([field, label]) =>
        <label key={field}>{label}<input type="number" min="0" step={field === 'price' ? '0.01' : '1'} required disabled={busy}
          value={form[field]} onChange={(event) => change(field, event.target.value)} /></label>)}
      <label>Product images (multiple)<input type="file" accept="image/*" multiple disabled={busy}
        onChange={(event) => { setFiles(Array.from(event.target.files || [])); setUploadError('') }} /></label>
      <button type="button" className="ghost-button" disabled={busy || !files.length} onClick={upload}>{uploading ? 'Uploading images...' : `Upload selected images (${files.length})`}</button>
      <label>Or add an image URL<input type="url" disabled={busy} value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} /></label>
      <button type="button" className="ghost-button" disabled={busy || !imageUrl.trim()} onClick={() => {
        try {
          const url = new URL(imageUrl.trim())
          if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Use an HTTP or HTTPS image URL.')
          change('images', [...new Set([...form.images, url.href])]); setImageUrl(''); setUploadError('')
        } catch { setUploadError('Enter a valid HTTP or HTTPS image URL.') }
      }}>Add image URL</button>
      <div className="details-thumbnails">{form.images.map((image, index) => <div key={image}>
        <img src={image} alt={`Product image ${index + 1}`} width="72" height="72" />
        <button type="button" className="ghost-button" disabled={busy} onClick={() => change('images', form.images.filter((url) => url !== image))}>Remove image {index + 1}</button>
      </div>)}</div>
      <p>The first image is the primary image. Upload selected files before saving.</p>
      <div className="action-row"><button className="solid-button" disabled={busy || files.length > 0}>{editing ? 'Save your product' : 'Publish product now'}</button>
        <button type="button" className="ghost-button" disabled={busy} onClick={reset}>Cancel / reset product</button></div>
    </form>
    <h3>Products created by this store</h3>
    {!ownProducts.length ? <p>This store has not created any catalog products yet.</p> : null}
    {ownProducts.map((product) => <div className="action-row" key={entityId(product)}>
      <span>{product.name}</span>
      <button type="button" className="ghost-button" disabled={busy} onClick={() => edit(product)}>Edit your product</button>
      <button type="button" className="danger-button" disabled={busy} onClick={() => {
        if (!window.confirm(`Delete "${product.name}" from the shared catalog? This is not just removal of this location’s inventory.`)) return
        action.run(async () => {
          const result = await deliveryRequest(`${base}/products/${encodeURIComponent(entityId(product))}`, { method: 'DELETE' })
          setWarnings(catalogNotificationWarnings(result))
          if (editing === entityId(product)) reset()
          await refresh()
        }, 'Your catalog product was deleted.')
      }}>Delete your product</button>
    </div>)}
    <h3>{categoryId ? 'Edit your category' : 'Create a missing category'}</h3>
    <form className="form-grid" onSubmit={(event) => {
      event.preventDefault()
      action.run(async () => {
        if (categoryId && !ownCategories.some((entry) => entityId(entry) === categoryId)) throw new Error('You can only edit categories created by this store.')
        const result = await deliveryRequest(`${base}/categories${categoryId ? `/${encodeURIComponent(categoryId)}` : ''}`, {
          method: categoryId ? 'PUT' : 'POST', data: { ...category, name: category.name.trim() },
        })
        if (!entityId(result)) throw new Error('The server did not return the saved category. Refresh categories before retrying.')
        setWarnings(catalogNotificationWarnings(result))
        change('category', entityId(result))
        setCategory(emptyCategory); setCategoryId('')
        await refresh()
      }, 'Category saved or existing shared category reused; selected for your product.')
    }}>
      {['name', 'icon', 'color'].map((field) => <label key={field}>{`Category ${field}`}
        <input required={field === 'name'} disabled={busy} type={field === 'color' ? 'color' : 'text'} value={category[field]}
          onChange={(event) => setCategory((current) => ({ ...current, [field]: event.target.value }))} />
      </label>)}
      <div className="action-row"><button className="solid-button" disabled={busy}>{categoryId ? 'Save your category' : 'Create or reuse category'}</button>
        <button type="button" className="ghost-button" disabled={busy} onClick={() => { setCategory(emptyCategory); setCategoryId('') }}>Cancel / reset category</button></div>
    </form>
    <h3>Categories created by this store</h3>
    {ownCategories.map((entry) => <div className="action-row" key={entityId(entry)}><span>{entry.name}</span>
      <button type="button" className="ghost-button" disabled={busy} onClick={() => {
        setCategoryId(entityId(entry)); setCategory({ name: entry.name, icon: entry.icon || '', color: entry.color || '#f29a43' })
      }}>Edit your category</button>
      <button type="button" className="danger-button" disabled={busy} onClick={() => {
        if (!window.confirm(`Delete your category "${entry.name}"? Categories in use may not be deleted.`)) return
        action.run(async () => {
          const result = await deliveryRequest(`${base}/categories/${encodeURIComponent(entityId(entry))}`, { method: 'DELETE' })
          setWarnings(catalogNotificationWarnings(result))
          if (form.category === entityId(entry)) change('category', '')
          if (categoryId === entityId(entry)) { setCategory(emptyCategory); setCategoryId('') }
          await refresh()
        }, 'Your category was deleted.')
      }}>Delete your category</button>
    </div>)}
  </article>
}
