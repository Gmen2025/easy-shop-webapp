import { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link, useParams } from 'react-router-dom'
import AdminNavigation from '../components/AdminNavigation'
import {
  clearAdminState,
  createCategoryAdmin,
  createProductAdmin,
  deleteCategoryAdmin,
  deleteOrderAdmin,
  deleteProductAdmin,
  fetchAdminCatalog,
  fetchBankAccountsAdmin,
  manageBankAccountAdmin,
  updateOrderStatusAdmin,
  updateCategoryAdmin,
  updateProductAdmin,
} from '../features/admin/adminSlice'
import {
  fetchMaintenanceMode,
  updateMaintenanceModeAdmin,
} from '../features/maintenance/maintenanceSlice'
import LoadingState from '../components/LoadingState'
import SocialLoginSettings from '../components/SocialLoginSettings'
import ErrorState from '../components/ErrorState'
import { formatCurrency, getPrimaryProductImage } from '../utils/format'
import { uploadProductImages } from '../api/uploads'
import {
  deleteServiceRequest,
  getAllServiceRequests,
  getDeliverySettings,
  updateDeliverySettings,
  updateServiceRequest,
} from '../api/serviceRequests'
import { getLowStockThreshold, setLowStockThreshold } from '../utils/inventory'
import { getSelectedDatabaseName } from '../api/client'

const defaultCategory = { name: '', icon: '', color: '#f29a43' }

function ProductThumbnail({ product }) {
  const source = getPrimaryProductImage(product, '')
  const [failedSource, setFailedSource] = useState(null)
  return source && source !== failedSource ? (
    <img className="admin-product-thumbnail" src={source} alt={product.name || 'Product'}
      loading="lazy" width={72} height={72} onError={() => setFailedSource(source)} />
  ) : (
    <div className="admin-product-thumbnail admin-product-placeholder" role="img"
      aria-label={`No image for ${product.name || 'product'}`}>No image</div>
  )
}

const defaultProduct = {
  name: '',
  description: '',
  richDescription: '',
  image: '',
  images: [],
  brand: '',
  price: '',
  category: '',
  countInStock: '',
  rating: '0',
  numReviews: '0',
  isFeatured: false,
}
const defaultBankAccountForm = {
  _id: '',
  bankName: '',
  accountNumber: '',
  accountHolderName: '',
  bankCode: '',
  additionalInfo: '',
  currency: '',
  isActive: true,
}
const defaultDeliveryConfig = {
  sameDayBase: 9,
  sameDayPerKm: 1,
  sameDayPremium: 4,
  nextDayBase: 4,
  nextDayPerKm: 0.6,
  scheduledBase: 5,
  scheduledPerKm: 0.75,
  scheduledPeakSurcharge: 1.5,
  scheduledOffPeakDiscount: 0.5,
  sameDayWindowHours: 4,
  nextDayWindowHours: 8,
  scheduledWindowHours: 2,
}
const orderStatusOptions = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled']
const serviceRequestStatusOptions = ['new', 'assigned', 'in_progress', 'quoted', 'completed', 'cancelled']

function formatServiceRequestStatus(status) {
  return String(status || 'new')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatServiceRequestDate(value) {
  if (!value) {
    return 'Date unavailable'
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString()
}

function getOrderPaymentDetails(order) {
  const paymentMethod = String(order?.paymentMethod || 'N/A').trim() || 'N/A'
  const paymentMeta = order?.paymentMeta && typeof order.paymentMeta === 'object'
    ? order.paymentMeta
    : {}

  const bankName = String(
    paymentMeta.bankName || paymentMeta.bank || paymentMeta.bank_name || order?.bankName || '',
  ).trim()
  const senderName = String(
    paymentMeta.senderName || paymentMeta.sender || paymentMeta.sender_name || order?.senderName || '',
  ).trim()
  const transferReference = String(
    paymentMeta.transferReference ||
    paymentMeta.reference ||
    paymentMeta.transfer_reference ||
    order?.transferReference ||
    '',
  ).trim()
  const isBankTransfer = /bank\s*transfer/i.test(paymentMethod)

  return {
    paymentMethod,
    isBankTransfer,
    bankName,
    senderName,
    transferReference,
  }
}

function getDeliveryModeLabel(deliveryMode) {
  const labels = {
    SAME_DAY: 'Same Day',
    NEXT_DAY: 'Next Day',
    SCHEDULED: 'Scheduled',
  }
  return labels[deliveryMode] || 'Same Day'
}

function AdminDashboardPage() {
  const { section = 'products' } = useParams()
  const [search, setSearch] = useState('')
  const [orderFilter, setOrderFilter] = useState('')
  const titles = { products: 'Products', categories: 'Categories', orders: 'Orders', inventory: 'Inventory',
    banks: 'Bank Accounts', services: 'Service Requests', delivery: 'Delivery Cost Settings',
    maintenance: 'Maintenance', social: 'Social Sign-in' }
  const catalogSection = ['products', 'inventory', 'categories', 'orders', 'banks'].includes(section)
  const dispatch = useDispatch()
  const { categories, products, orders, bankAccounts, loading, saving, error, message } = useSelector(
    (state) => state.admin,
  )
  const {
    enabled: maintenanceEnabled,
    updating: updatingMaintenance,
    error: maintenanceError,
    lastSyncedAt,
  } = useSelector((state) => state.maintenance)

  const [categoryForm, setCategoryForm] = useState(defaultCategory)
  const [categoryEditId, setCategoryEditId] = useState('')
  const [productForm, setProductForm] = useState(defaultProduct)
  const [productEditId, setProductEditId] = useState('')
  const [imageFiles, setImageFiles] = useState([])
  const [uploadingImage, setUploadingImage] = useState(false)
  const [uploadMessage, setUploadMessage] = useState('')
  const [minimumStockThreshold, setMinimumStockThreshold] = useState(() => getLowStockThreshold())
  const [thresholdInput, setThresholdInput] = useState(() => String(getLowStockThreshold()))
  const [thresholdError, setThresholdError] = useState('')
  const [bankAccountForm, setBankAccountForm] = useState(defaultBankAccountForm)
  const [bankAccountEditId, setBankAccountEditId] = useState('')
  const [serviceRequests, setServiceRequests] = useState([])
  const [serviceRequestsLoading, setServiceRequestsLoading] = useState(true)
  const [serviceRequestsError, setServiceRequestsError] = useState('')
  const [serviceRequestActionId, setServiceRequestActionId] = useState('')
  const [deliveryConfig, setDeliveryConfig] = useState(defaultDeliveryConfig)
  const [deliveryOriginAddress, setDeliveryOriginAddress] = useState('')
  const [distanceApiEnabled, setDistanceApiEnabled] = useState(false)
  const [deliveryLoading, setDeliveryLoading] = useState(true)
  const [deliverySaving, setDeliverySaving] = useState(false)
  const [deliveryMessage, setDeliveryMessage] = useState('')
  const [deliveryError, setDeliveryError] = useState('')

  useEffect(() => {
    dispatch(clearAdminState())
    if (catalogSection) dispatch(fetchAdminCatalog(section))
  }, [dispatch, section, catalogSection])

  useEffect(() => {
    if (section === 'maintenance') dispatch(fetchMaintenanceMode())
  }, [dispatch, section])

  useEffect(() => {
    if (section !== 'delivery') return
    getDeliverySettings()
      .then((response) => {
        if (response?.deliveryConfig) {
          setDeliveryConfig((current) => ({ ...current, ...response.deliveryConfig }))
        }
        setDeliveryOriginAddress(response?.deliveryOrigin?.address || '')
        setDistanceApiEnabled(Boolean(response?.distanceApiEnabled))
      })
      .catch((requestError) => setDeliveryError(requestError.message || 'Unable to load delivery settings.'))
      .finally(() => setDeliveryLoading(false))
  }, [section])

  useEffect(() => {
    if (section !== 'services') return
    let isCurrent = true

    getAllServiceRequests()
      .then((response) => {
        if (isCurrent) {
          setServiceRequests(Array.isArray(response) ? response : response?.items || [])
        }
      })
      .catch((requestError) => {
        if (isCurrent) {
          setServiceRequestsError(requestError.message || 'Unable to load service requests.')
        }
      })
      .finally(() => {
        if (isCurrent) {
          setServiceRequestsLoading(false)
        }
      })

    return () => {
      isCurrent = false
    }
  }, [section])

  const effectiveProductCategory =
    productForm.category || categories[0]?.id || categories[0]?._id || ''

  const selectedCategoryName = useMemo(() => {
    const category = categories.find(
      (item) => (item.id || item._id) === effectiveProductCategory,
    )
    return category?.name || 'No category'
  }, [categories, effectiveProductCategory])

  const lowStockProducts = useMemo(
    () =>
      products
        .filter((product) => Number(product.countInStock || 0) <= minimumStockThreshold)
        .sort((a, b) => Number(a.countInStock || 0) - Number(b.countInStock || 0)),
    [products, minimumStockThreshold],
  )

  function applyMinimumStockThreshold() {
    if (!/^\d+$/.test(thresholdInput) || !Number.isSafeInteger(Number(thresholdInput))) {
      setThresholdError('Enter a whole number of zero or more.')
      return
    }
    try {
      const normalizedThreshold = setLowStockThreshold(thresholdInput)
      setMinimumStockThreshold(normalizedThreshold)
      setThresholdInput(String(normalizedThreshold))
      setThresholdError('')
    } catch (failure) {
      setThresholdError(`Unable to save the threshold in this browser: ${failure.message}`)
    }
  }

  function populateCategoryForm(category) {
    setCategoryEditId(category.id || category._id)
    setCategoryForm({
      name: category.name || '',
      icon: category.icon || '',
      color: category.color || '#f29a43',
    })
  }

  function populateProductForm(product) {
    document.getElementById('admin-product-editor')?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    const images = [
      ...(Array.isArray(product.images) ? product.images : []),
      product.image,
    ].filter((image, index, array) => typeof image === 'string' && image.trim() && array.indexOf(image) === index)

    setProductEditId(product.id || product._id)
    setProductForm({
      name: product.name || '',
      description: product.description || '',
      richDescription: product.richDescription || '',
      image: images[0] || '',
      images,
      brand: product.brand || '',
      price: String(product.price ?? ''),
      category: product.category?.id || product.category?._id || product.category || '',
      countInStock: String(product.countInStock ?? ''),
      rating: String(product.rating ?? 0),
      numReviews: String(product.numReviews ?? 0),
      isFeatured: Boolean(product.isFeatured),
    })
    setImageFiles([])
    setUploadMessage('')
  }

  async function submitCategory(event) {
    event.preventDefault()
    dispatch(clearAdminState())

    const result = categoryEditId
      ? await dispatch(
        updateCategoryAdmin({ id: categoryEditId, payload: categoryForm }),
      )
      : await dispatch(createCategoryAdmin(categoryForm))
    if (result.meta.requestStatus === 'fulfilled') {
      setCategoryEditId('')
      setCategoryForm(defaultCategory)
    }
  }

  async function submitProduct(event) {
    event.preventDefault()
    dispatch(clearAdminState())

    const normalizedImages = productForm.images
      .map((image) => String(image || '').trim())
      .filter((image) => image)

    if (normalizedImages.length === 0) {
      setUploadMessage('Add at least one product image URL or upload images before saving.')
      return
    }

    const payload = {
      ...productForm,
      image: normalizedImages[0],
      images: normalizedImages,
      price: Number(productForm.price || 0),
      category: effectiveProductCategory,
      countInStock: Number(productForm.countInStock || 0),
      rating: Number(productForm.rating),
      numReviews: Number(productForm.numReviews),
      isFeatured: Boolean(productForm.isFeatured),
    }

    const result = productEditId
      ? await dispatch(updateProductAdmin({ id: productEditId, payload }))
      : await dispatch(createProductAdmin(payload))
    if (result.meta.requestStatus !== 'fulfilled') return

    setProductEditId('')
    setProductForm({
      ...defaultProduct,
      category: categories[0]?.id || categories[0]?._id || '',
    })
    setImageFiles([])
    setUploadMessage('')
  }

  async function handleImageUpload() {
    if (!imageFiles.length) {
      setUploadMessage('Choose one or more images before uploading.')
      return
    }

    setUploadingImage(true)
    setUploadMessage('')
    try {
      const imageUrls = await uploadProductImages(imageFiles)
      setProductForm((current) => ({
        ...current,
        images: [...current.images, ...imageUrls].filter(
          (image, index, array) => array.indexOf(image) === index,
        ),
      }))
      setImageFiles([])
      setUploadMessage(`${imageUrls.length} image(s) uploaded and added to this product.`)
    } catch (uploadError) {
      setUploadMessage(uploadError.message)
    } finally {
      setUploadingImage(false)
    }
  }

  function handleSingleImageUrlChange(imageUrl) {
    setProductForm((current) => ({
      ...current,
      image: imageUrl,
      images: imageUrl ? [imageUrl] : [],
    }))
  }

  function removeProductImage(imageUrl) {
    setProductForm((current) => {
      const images = current.images.filter((image) => image !== imageUrl)
      return {
        ...current,
        images,
        image: images[0] || '',
      }
    })
  }

  function populateBankAccountForm(bank) {
    setBankAccountEditId(bank?._id || bank?.id || '')
    setBankAccountForm({
      _id: bank?._id || bank?.id || '',
      bankName: bank?.bankName || '',
      accountNumber: bank?.accountNumber || '',
      accountHolderName: bank?.accountHolderName || '',
      bankCode: bank?.bankCode || '',
      additionalInfo: bank?.additionalInfo || '',
      currency: bank?.currency || (/usa/i.test(getSelectedDatabaseName()) ? 'USD' : 'ETB'),
      isActive: bank?.isActive !== false,
    })
  }

  function resetBankAccountForm() {
    setBankAccountEditId('')
    setBankAccountForm(defaultBankAccountForm)
  }

  async function submitBankAccount(event) {
    event.preventDefault()
    dispatch(clearAdminState())

    const action = bankAccountEditId ? 'update' : 'add'
    const payload = {
      ...bankAccountForm,
      _id: bankAccountEditId || undefined,
      bankName: String(bankAccountForm.bankName || '').trim(),
      accountNumber: String(bankAccountForm.accountNumber || '').trim(),
      accountHolderName: String(bankAccountForm.accountHolderName || '').trim(),
      bankCode: String(bankAccountForm.bankCode || '').trim(),
      additionalInfo: String(bankAccountForm.additionalInfo || '').trim(),
      currency: bankAccountForm.currency || (/usa/i.test(getSelectedDatabaseName()) ? 'USD' : 'ETB'),
    }

    const resultAction = await dispatch(manageBankAccountAdmin({ action, bankAccount: payload }))
    if (manageBankAccountAdmin.fulfilled.match(resultAction)) {
      resetBankAccountForm()
    }
  }

  function deleteBankAccount(bankAccountId) {
    if (!bankAccountId || !window.confirm('Delete this bank account? Customers will no longer be able to select it.')) {
      return
    }

    dispatch(clearAdminState())
    dispatch(
      manageBankAccountAdmin({
        action: 'delete',
        bankAccount: { _id: bankAccountId },
      }),
    )
  }

  if (loading && catalogSection) {
    return <section className="page-stack"><AdminNavigation /><LoadingState label="Loading admin tools..." /></section>
  }

  if (error && catalogSection && !categories.length && !products.length && !orders.length && !bankAccounts.length) {
    return <section className="page-stack"><AdminNavigation /><ErrorState message={error} onRetry={() => dispatch(fetchAdminCatalog(section))} /></section>
  }

  function handleOrderStatusChange(orderId, status) {
    dispatch(clearAdminState())
    dispatch(updateOrderStatusAdmin({ id: orderId, status }))
  }

  function handleDeleteOrder(orderId, customerEmail, customerName) {
    if (!window.confirm('Permanently delete this order and notify the customer?')) return
    dispatch(clearAdminState())
    dispatch(deleteOrderAdmin({ id: orderId, customerEmail, customerName }))
  }

  async function handleMaintenanceToggle() {
    if (!window.confirm(`${maintenanceEnabled ? 'Disable' : 'Enable'} maintenance mode across configured regions? ${maintenanceEnabled ? 'Customers can use the shop again.' : 'Customers will not be able to use the shop.'}`)) return
    await dispatch(updateMaintenanceModeAdmin(!maintenanceEnabled))
  }

  function updateDeliveryField(event) {
    const { name, value } = event.target
    setDeliveryConfig((current) => ({ ...current, [name]: value }))
  }

  async function saveDeliveryConfig(event) {
    event.preventDefault()
    setDeliverySaving(true)
    setDeliveryMessage('')
    setDeliveryError('')
    try {
      const normalized = Object.fromEntries(
        Object.entries(deliveryConfig).map(([key, value]) => [key, Number(value)]),
      )
      const response = await updateDeliverySettings(normalized, { address: deliveryOriginAddress.trim() })
      setDeliveryConfig((current) => ({ ...current, ...response.deliveryConfig }))
      setDeliveryOriginAddress(response?.deliveryOrigin?.address || '')
      setDeliveryMessage('Delivery settings saved for the selected database.')
    } catch (requestError) {
      setDeliveryError(requestError.message || 'Unable to save delivery settings.')
    } finally {
      setDeliverySaving(false)
    }
  }

  function refreshServiceRequests() {
    setServiceRequestsLoading(true)
    setServiceRequestsError('')
    getAllServiceRequests()
      .then((response) => {
        setServiceRequests(Array.isArray(response) ? response : response?.items || [])
      })
      .catch((requestError) => {
        setServiceRequestsError(requestError.message || 'Unable to load service requests.')
      })
      .finally(() => {
        setServiceRequestsLoading(false)
      })
  }

  async function changeServiceRequestStatus(request, status) {
    const requestId = request._id || request.id
    setServiceRequestActionId(requestId)
    setServiceRequestsError('')
    try {
      const updated = await updateServiceRequest(requestId, { status })
      setServiceRequests((current) => current.map((item) => (
        (item._id || item.id) === requestId ? updated : item
      )))
    } catch (requestError) {
      setServiceRequestsError(requestError.message || 'Unable to update service request.')
    } finally {
      setServiceRequestActionId('')
    }
  }

  async function removeServiceRequest(request) {
    const requestId = request._id || request.id
    if (!requestId || !window.confirm('Delete this service request permanently?')) {
      return
    }

    setServiceRequestActionId(requestId)
    setServiceRequestsError('')
    try {
      await deleteServiceRequest(requestId)
      setServiceRequests((current) => current.filter((item) => (item._id || item.id) !== requestId))
    } catch (requestError) {
      setServiceRequestsError(requestError.message || 'Unable to delete service request.')
    } finally {
      setServiceRequestActionId('')
    }
  }

  return (
    <section className="page-stack admin-console">
      <AdminNavigation />
      {!titles[section] ? <p role="alert">Unknown admin tool. Choose a tool above.</p> : null}
      <section className="panel">
        <div className="panel-header">
          <h1>{titles[section] || 'Admin tools'}</h1>
          {['products', 'inventory'].includes(section) ? <span>{products.length} products</span> : null}
        </div>
        {message ? <p className="form-success">{message}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
      </section>

      {section === 'maintenance' ? <section className="panel">
        <div className="panel-header">
          <h3>Site Maintenance Mode</h3>
          <span className={maintenanceEnabled ? 'status-pill status-on' : 'status-pill status-off'}>
            {maintenanceEnabled ? 'ON' : 'OFF'}
          </span>
        </div>
        <p className="section-note">
          Toggle this to instantly show a maintenance page for shoppers without redeploying.
          This updates all configured databases (for example Ethio and USA) with one click.
        </p>
        {maintenanceError ? <p className="form-error">{maintenanceError}</p> : null}
        {lastSyncedAt ? (
          <small className="section-note">
            Last updated: {new Date(lastSyncedAt).toLocaleString()}
          </small>
        ) : null}
        <div className="inline-actions">
          <button
            type="button"
            className="solid-button"
            onClick={handleMaintenanceToggle}
            disabled={updatingMaintenance}
          >
            {updatingMaintenance
              ? 'Saving...'
              : maintenanceEnabled
                ? 'Turn Maintenance OFF'
                : 'Turn Maintenance ON'}
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => dispatch(fetchMaintenanceMode())}
            disabled={updatingMaintenance}
          >
            Refresh Status
          </button>
        </div>
      </section> : null}

      {section === 'social' ? <SocialLoginSettings /> : null}

      {section === 'inventory' ? <section className="panel">
        <div className="panel-header">
          <h3>Low Stock Alerts</h3>
          <span>{lowStockProducts.length} product(s)</span>
        </div>
        <div className="threshold-control">
          <label htmlFor="minimum-stock-threshold">Minimum threshold
            <input
              id="minimum-stock-threshold"
              type="number"
              min="0"
              step="1"
              value={thresholdInput}
              onChange={(event) => setThresholdInput(event.target.value)}
            />
          </label>
          <button type="button" className="ghost-button" onClick={applyMinimumStockThreshold}>Apply threshold</button>
        </div>
        {thresholdError ? <p role="alert">{thresholdError}</p> : null}
        {lowStockProducts.length ? (
          <div className="admin-list">
            {lowStockProducts.map((product) => (
              <article key={product.id || product._id} className="admin-item">
                <div>
                  <strong>{product.name}</strong>
                  <small className="stock-warning">
                    {Number(product.countInStock || 0)} left (minimum {minimumStockThreshold})
                  </small>
                </div>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => populateProductForm(product)}
                >
                  Restock
                </button>
              </article>
            ))}
          </div>
        ) : (
          <p className="form-success">
            All products are above the minimum stock threshold ({minimumStockThreshold}).
          </p>
        )}
      </section> : null}

      {section === 'delivery' ? <section className="panel">
        <div className="panel-header">
          <h3>Delivery Cost Settings</h3>
          <span>{deliveryLoading ? 'Loading...' : 'Selected database'}</span>
        </div>
        <p className="section-note">
          These rates control customer estimates and the final server-calculated delivery fee.
        </p>
        <p className="section-note">
          {distanceApiEnabled
            ? 'Google-based distance calculation is enabled on the server.'
            : 'Google-based distance calculation is not configured (set GOOGLE_MAPS_API_KEY on the server). Customers will enter distance manually until then.'}
        </p>
        {deliveryError ? <p className="form-error">{deliveryError}</p> : null}
        {deliveryMessage ? <p className="form-success">{deliveryMessage}</p> : null}
        <form className="delivery-settings-form" onSubmit={saveDeliveryConfig}>
          <label>
            Store/warehouse origin address (used to auto-calculate delivery distance)
            <input
              type="text"
              value={deliveryOriginAddress}
              onChange={(event) => setDeliveryOriginAddress(event.target.value)}
              placeholder="e.g. Bole Road, Addis Ababa, Ethiopia"
            />
          </label>
          <div className="delivery-settings-grid">
            {[
              ['sameDayBase', 'Same-day base fee'],
              ['sameDayPerKm', 'Same-day fee per km'],
              ['sameDayPremium', 'Same-day premium'],
              ['nextDayBase', 'Next-day base fee'],
              ['nextDayPerKm', 'Next-day fee per km'],
              ['scheduledBase', 'Scheduled base fee'],
              ['scheduledPerKm', 'Scheduled fee per km'],
              ['scheduledPeakSurcharge', 'Scheduled peak surcharge'],
              ['scheduledOffPeakDiscount', 'Scheduled off-peak discount'],
              ['sameDayWindowHours', 'Same-day window (hours)'],
              ['nextDayWindowHours', 'Next-day window (hours)'],
              ['scheduledWindowHours', 'Scheduled window (hours)'],
            ].map(([name, label]) => (
              <label key={name}>
                {label}
                <input
                  name={name}
                  type="number"
                  min="0"
                  step="0.01"
                  value={deliveryConfig[name]}
                  onChange={updateDeliveryField}
                  required
                />
              </label>
            ))}
          </div>
          <button type="submit" className="solid-button" disabled={deliveryLoading || deliverySaving}>
            {deliverySaving ? 'Saving...' : 'Save Delivery Settings'}
          </button>
        </form>
      </section> : null}

      {section === 'delivery' ? <section className="panel">
        <h2>Shared delivery operations</h2>
        <div className="action-row">
          <Link className="solid-button" to="/admin/delivery">Vehicles, cargo & delivery windows</Link>
          <Link className="ghost-button" to="/admin/delivery-payments">Combined payments & refunds</Link>
          <Link className="ghost-button" to="/admin/international-payments">Exchange rates & international shipping</Link>
          <Link className="ghost-button" to="/driver/deliveries">Driver pickup & drop-off</Link>
        </div>
      </section> : null}
      {section === 'categories' ? <section className="panel admin-grid">
        <form className="admin-form" onSubmit={submitCategory}>
          <h3>{categoryEditId ? 'Update Category' : 'Create Category'}</h3>
          <label>Category name<input
            value={categoryForm.name}
            onChange={(event) =>
              setCategoryForm((current) => ({ ...current, name: event.target.value }))
            }
            placeholder="Category Name"
            required
          /></label>
          <label>Icon<input
            value={categoryForm.icon}
            onChange={(event) =>
              setCategoryForm((current) => ({ ...current, icon: event.target.value }))
            }
            placeholder="Icon"
          /></label>
          <label>Category color<input
            type="color"
            value={categoryForm.color}
            onChange={(event) =>
              setCategoryForm((current) => ({ ...current, color: event.target.value }))
            }
          /></label>
          <button type="submit" className="solid-button" disabled={saving}>
            {categoryEditId ? 'Save Category' : 'Add Category'}
          </button>
        </form>

        <div className="admin-list">
          <h3>Categories</h3>
          {categories.map((category) => (
            <article key={category.id || category._id} className="admin-item">
              <div>
                <strong>{category.name}</strong>
                <small>{category.color}</small>
              </div>
              <div className="inline-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => populateCategoryForm(category)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => { if (window.confirm(`Delete category ${category.name}?`)) dispatch(deleteCategoryAdmin(category.id || category._id)) }}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      </section> : null}

      {['products', 'inventory'].includes(section) ? <section className="panel admin-grid">
        <form id="admin-product-editor" className="admin-form" onSubmit={submitProduct}>
          <h3>{productEditId ? 'Update Product' : 'Create Product'}</h3>
          <label>Product name<input
            value={productForm.name}
            onChange={(event) =>
              setProductForm((current) => ({ ...current, name: event.target.value }))
            }
            placeholder="Product Name"
            required
          /></label>
          <label>Brand<input
            value={productForm.brand}
            onChange={(event) =>
              setProductForm((current) => ({ ...current, brand: event.target.value }))
            }
            placeholder="Brand"
          /></label>
          <label>Single image URL<input
            value={productForm.image}
            onChange={(event) => handleSingleImageUrlChange(event.target.value.trim())}
            placeholder="Single Image URL"
          /></label>
          <div className="file-upload-row">
            <label>Product images
              <input
                type="file"
                aria-label="Product images"
                multiple
                accept="image/*"
                onChange={(event) =>
                  setImageFiles(Array.from(event.target.files || []))
                }
              />
            </label>
            <button
              type="button"
              className="ghost-button"
              onClick={handleImageUpload}
              disabled={uploadingImage}
            >
              {uploadingImage ? 'Uploading...' : 'Upload Selected Images'}
            </button>
          </div>
          {productForm.images.length ? (
            <div className="admin-image-preview-grid">
              {productForm.images.map((imageUrl) => (
                <div key={imageUrl} className="admin-image-preview-item">
                  <img src={imageUrl} alt="Product" />
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => removeProductImage(imageUrl)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <small>No images selected yet.</small>
          )}
          {uploadMessage ? <small>{uploadMessage}</small> : null}
          <label>Description<textarea
            value={productForm.description}
            onChange={(event) =>
              setProductForm((current) => ({ ...current, description: event.target.value }))
            }
            placeholder="Description"
            rows={2}
            required
          /></label>
          <label>Rich description<textarea
            value={productForm.richDescription}
            onChange={(event) =>
              setProductForm((current) => ({
                ...current,
                richDescription: event.target.value,
              }))
            }
            placeholder="Rich Description"
            rows={2}
          /></label>
          <label>Category<select
            value={effectiveProductCategory}
            onChange={(event) =>
              setProductForm((current) => ({ ...current, category: event.target.value }))
            }
            required
          >
            {categories.map((category) => (
              <option key={category.id || category._id} value={category.id || category._id}>
                {category.name}
              </option>
            ))}
          </select></label>
          <label>Price<input
            type="number"
            min="0"
            step="0.01"
            value={productForm.price}
            onChange={(event) =>
              setProductForm((current) => ({ ...current, price: event.target.value }))
            }
            placeholder="Price"
            required
          /></label>
          <label>Stock<input
            type="number"
            min="0"
            step="1"
            value={productForm.countInStock}
            onChange={(event) =>
              setProductForm((current) => ({ ...current, countInStock: event.target.value }))
            }
            placeholder="Stock"
            required
          /></label>
          <label>Rating (0-5)<input type="number" min="0" max="5" step="0.1" required value={productForm.rating}
            onChange={(event) => setProductForm((current) => ({ ...current, rating: event.target.value }))} /></label>
          <label>Number of reviews<input type="number" min="0" step="1" required value={productForm.numReviews}
            onChange={(event) => setProductForm((current) => ({ ...current, numReviews: event.target.value }))} /></label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={productForm.isFeatured}
              onChange={(event) =>
                setProductForm((current) => ({
                  ...current,
                  isFeatured: event.target.checked,
                }))
              }
            />
            Featured Product
          </label>
          <small>Category: {selectedCategoryName}</small>
          <Link to="/admin/delivery">Configure packaged size and weight</Link>
          <button type="submit" className="solid-button" disabled={saving}>
            {productEditId ? 'Save Product' : 'Add Product'}
          </button>
          {productEditId ? <button type="button" className="ghost-button" onClick={() => {
            setProductEditId(''); setProductForm(defaultProduct); setImageFiles([]); setUploadMessage('')
          }}>Cancel product edit</button> : null}
        </form>

        <div className="admin-list">
          <h3>Products</h3>
          <label>Search products<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or brand" /></label>
          {products.filter((product) => `${product.name} ${product.brand || ''}`.toLowerCase().includes(search.toLowerCase())).map((product) => (
            <article key={product.id || product._id} className="admin-item">
              <div className="admin-product-summary">
                <ProductThumbnail product={product} />
                <div className="admin-product-details">
                  <strong>{product.name}</strong>
                  <small>{formatCurrency(product.price)}</small>
                  <small>Stock: {Number(product.countInStock || 0)}</small>
                  {Number(product.countInStock || 0) <= minimumStockThreshold ? (
                    <small className="stock-warning">Low stock</small>
                  ) : null}
                </div>
              </div>
              <div className="inline-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => populateProductForm(product)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => { if (window.confirm(`Delete ${product.name}? This cannot be undone.`)) dispatch(deleteProductAdmin(product.id || product._id)) }}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      </section> : null}

      {section === 'banks' ? <section className="panel admin-grid">
        <form className="admin-form" onSubmit={submitBankAccount}>
          <h3>{bankAccountEditId ? 'Update Bank Account' : 'Add Bank Account'}</h3>
          <label>Account currency<select value={bankAccountForm.currency || (/usa/i.test(getSelectedDatabaseName()) ? 'USD' : 'ETB')}
            onChange={(event) => setBankAccountForm((current) => ({ ...current, currency: event.target.value }))}>
            <option value="ETB">ETB - birr</option><option value="USD">USD - US dollars</option>
          </select></label>
          <p className="section-note">Use explicitly USD-tagged accounts for Ethiopia USD checkout and ETB-tagged accounts for USA exports. Only matching-currency accounts are offered to shoppers.</p>
          <label>Bank Name
            <input
              value={bankAccountForm.bankName}
              onChange={(event) =>
                setBankAccountForm((current) => ({ ...current, bankName: event.target.value }))
              }
              placeholder="Bank Name"
              required
            />
          </label>
          <label>Account Number
            <input
              value={bankAccountForm.accountNumber}
              onChange={(event) =>
                setBankAccountForm((current) => ({ ...current, accountNumber: event.target.value }))
              }
              placeholder="Account Number"
              required
            />
          </label>
          <label>Account Holder Name
            <input
              value={bankAccountForm.accountHolderName}
              onChange={(event) =>
                setBankAccountForm((current) => ({ ...current, accountHolderName: event.target.value }))
              }
              placeholder="Account Holder Name"
              required
            />
          </label>
          <label>Bank Code (optional)
            <input
              value={bankAccountForm.bankCode}
              onChange={(event) =>
                setBankAccountForm((current) => ({ ...current, bankCode: event.target.value }))
              }
              placeholder="Bank Code (optional)"
            />
          </label>
          <label>Additional Info (optional)
            <textarea
              value={bankAccountForm.additionalInfo}
              onChange={(event) =>
                setBankAccountForm((current) => ({ ...current, additionalInfo: event.target.value }))
              }
              placeholder="Additional Info (optional)"
              rows={2}
            />
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={bankAccountForm.isActive}
              onChange={(event) =>
                setBankAccountForm((current) => ({ ...current, isActive: event.target.checked }))
              }
            />
            Active
          </label>
          <div className="inline-actions">
            <button type="submit" className="solid-button" disabled={saving}>
              {bankAccountEditId ? 'Save Account' : 'Add Account'}
            </button>
            {bankAccountEditId ? (
              <button
                type="button"
                className="ghost-button"
                onClick={resetBankAccountForm}
                disabled={saving}
              >
                Cancel Edit
              </button>
            ) : null}
          </div>
        </form>

        <div className="admin-list">
          <div className="panel-header">
            <h3>Bank Accounts</h3>
            <span>{bankAccounts.length} active</span>
          </div>
          <p className="section-note">
            These accounts are shown to customers during bank transfer checkout.
          </p>
          <div className="inline-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={() => dispatch(fetchBankAccountsAdmin())}
              disabled={saving}
            >
              Refresh
            </button>
          </div>
          {bankAccounts.map((bank) => (
            <article key={bank._id || bank.id} className="admin-item">
              <div>
                <strong>{bank.bankName || 'N/A'}</strong>
                <small>Account Number: {bank.accountNumber || 'N/A'}</small>
                <small>Currency: {bank.currency || (/usa/i.test(getSelectedDatabaseName()) ? 'USD' : 'ETB')}</small>
                <small>Account Holder: {bank.accountHolderName || 'N/A'}</small>
                {bank.bankCode ? <small>Bank Code: {bank.bankCode}</small> : null}
                {bank.additionalInfo ? <small>{bank.additionalInfo}</small> : null}
              </div>
              <div className="inline-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => populateBankAccountForm(bank)}
                  disabled={saving}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => deleteBankAccount(bank._id || bank.id)}
                  disabled={saving}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
          {bankAccounts.length === 0 ? (
            <p className="section-note">No active bank accounts are configured yet.</p>
          ) : null}
        </div>
      </section> : null}

      {section === 'orders' ? <section className="panel">
        <div className="panel-header">
          <h3>Orders</h3>
          <span>{orders.length} total</span>
        </div>
        <div className="form-grid">
          <label>Search orders<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Order ID, name or email" /></label>
          <label>Status<select value={orderFilter} onChange={(event) => setOrderFilter(event.target.value)}><option value="">All statuses</option>
            {orderStatusOptions.map((status) => <option key={status}>{status}</option>)}</select></label>
        </div>
        <div className="admin-list">
          {orders.filter((order) => (!orderFilter || order.status === orderFilter) &&
            `${order.id || order._id} ${order.user?.name || ''} ${order.user?.email || order.customerEmail || ''}`.toLowerCase().includes(search.toLowerCase())).map((order) => {
            const orderId = order.id || order._id
            const orderUser = order.user
            const paymentDetails = getOrderPaymentDetails(order)
            const customerName =
              typeof orderUser === 'object' ? orderUser?.name || 'Customer' : 'Customer'
            const customerEmail =
              typeof orderUser === 'object'
                ? orderUser?.email || order.customerEmail || 'N/A'
                : order.customerEmail || 'N/A'
            const customerPhone = order.phone || (typeof orderUser === 'object' ? orderUser?.phone : '') || 'N/A'
            const orderItems = Array.isArray(order.orderItems) ? order.orderItems : []

            return (
              <article key={orderId} className="admin-item">
                <div>
                  <strong>Order #{orderId}</strong>
                  <small>
                    User: {customerName}
                  </small>
                  <small>Email: {customerEmail}</small>
                  <small>Phone: {customerPhone}</small>
                  <small>Address 1: {order.shippingAddress1 || 'N/A'}</small>
                  <small>Address 2: {order.shippingAddress2 || 'N/A'}</small>
                  <small>
                    {order.city || 'N/A'}, {order.zip || 'N/A'}, {order.country || 'N/A'}
                  </small>
                  <small>
                    Date: {new Date(order.dateOrdered).toLocaleString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </small>
                  <small>
                    Delivery: {getDeliveryModeLabel(order.deliveryMode)} (Fee:{' '}
                    {formatCurrency(order.deliveryFee || 0)})
                  </small>
                  {order.deliveryMode === 'SCHEDULED' && order.scheduledFor ? (
                    <small>Scheduled For: {new Date(order.scheduledFor).toLocaleString()}</small>
                  ) : null}
                  <small>Total: {formatCurrency(order.totalPrice || 0)}</small>
                  <small>Payment Method: {paymentDetails.paymentMethod}</small>
                  {paymentDetails.isBankTransfer && paymentDetails.bankName ? (
                    <small>Bank Name: {paymentDetails.bankName}</small>
                  ) : null}
                  {paymentDetails.isBankTransfer && paymentDetails.senderName ? (
                    <small>Sender Name: {paymentDetails.senderName}</small>
                  ) : null}
                  {paymentDetails.isBankTransfer && paymentDetails.transferReference ? (
                    <small>Transfer Ref: {paymentDetails.transferReference}</small>
                  ) : null}
                  <div className="order-items-block">
                    {orderItems.map((item) => {
                      const itemId = item.id || item._id
                      const product = item.product || {}
                      const quantity = Number(item.quantity || 0)
                      const price = Number(product.price || 0)
                      const lineSubtotal = quantity * price

                      return (
                        <div key={itemId} className="order-item-row">
                          <img
                            src={getPrimaryProductImage(product, 'https://placehold.co/64x64?text=Item')}
                            alt={product.name || 'Order item'}
                            width="54"
                            height="54"
                          />
                          <div>
                            <small>{product.name || 'Unnamed item'}</small>
                            <small>
                              Qty: {quantity} | Price: {formatCurrency(price)} | Subtotal:{' '}
                              {formatCurrency(lineSubtotal)}
                            </small>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div className="inline-actions">
                  <label>Order status<select
                    value={order.status || 'Pending'}
                    onChange={(event) =>
                      handleOrderStatusChange(orderId, event.target.value)
                    }
                    disabled={saving}
                  >
                    {orderStatusOptions.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select></label>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => handleDeleteOrder(orderId, customerEmail, customerName)}
                    disabled={saving}
                  >
                    Delete
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      </section> : null}

      {section === 'services' ? <section className="panel">
        <div className="panel-header">
          <h3>Service Requests</h3>
          <span>{serviceRequests.length} total</span>
        </div>
        <div className="inline-actions">
          <button
            type="button"
            className="ghost-button"
            onClick={refreshServiceRequests}
            disabled={serviceRequestsLoading}
          >
            {serviceRequestsLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
        {serviceRequestsError ? <p className="form-error">{serviceRequestsError}</p> : null}
        {!serviceRequestsLoading && !serviceRequestsError && serviceRequests.length === 0 ? (
          <p className="section-note">No service requests have been submitted.</p>
        ) : null}
        <div className="admin-list">
          {serviceRequests.map((request) => {
            const requestId = request._id || request.id
            const customer = request.customer && typeof request.customer === 'object'
              ? request.customer
              : null

            return (
              <article key={requestId} className="admin-item">
                <div>
                  <strong>{request.machineType || 'Machine service'}</strong>
                  <small>Request ID: {requestId}</small>
                  <small>Customer: {customer?.name || request.customerEmail || 'Customer'}</small>
                  <small>Email: {customer?.email || request.customerEmail || 'N/A'}</small>
                  <small>Contact phone: {request.contactPhone || customer?.phone || 'N/A'}</small>
                  <small>Country: {request.country || 'N/A'}</small>
                  <small>Location: {request.serviceLocation || request.locationCity || 'N/A'}</small>
                  <small>Address: {request.locationAddress || 'N/A'}</small>
                  <small>Priority: {request.priority || 'Normal'}</small>
                  <small>Status: {formatServiceRequestStatus(request.status)}</small>
                  <small>Submitted: {formatServiceRequestDate(request.createdAt || request.dateCreated)}</small>
                  {request.problemDescription ? <small>{request.problemDescription}</small> : null}
                  <div className="inline-actions">
                    <label>Request status<select
                      value={request.status || 'new'}
                      onChange={(event) => changeServiceRequestStatus(request, event.target.value)}
                      disabled={serviceRequestActionId === requestId}
                      aria-label={`Update status for request ${requestId}`}
                    >
                      {serviceRequestStatusOptions.map((status) => (
                        <option key={status} value={status}>
                          {formatServiceRequestStatus(status)}
                        </option>
                      ))}
                    </select></label>
                    <button
                      type="button"
                      className="ghost-button danger-button"
                      onClick={() => removeServiceRequest(request)}
                      disabled={serviceRequestActionId === requestId}
                    >
                      {serviceRequestActionId === requestId ? 'Saving...' : 'Delete'}
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </section> : null}
    </section>
  )
}

export default AdminDashboardPage