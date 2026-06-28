import { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  clearAdminState,
  createCategoryAdmin,
  createProductAdmin,
  deleteCategoryAdmin,
  deleteOrderAdmin,
  deleteProductAdmin,
  fetchAdminCatalog,
  updateOrderStatusAdmin,
  updateCategoryAdmin,
  updateProductAdmin,
} from '../features/admin/adminSlice'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'
import { formatCurrency, getPrimaryProductImage } from '../utils/format'
import { uploadProductImages } from '../api/uploads'

const defaultCategory = { name: '', icon: '', color: '#f29a43' }
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
  isFeatured: false,
}
const orderStatusOptions = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled']

function AdminDashboardPage() {
  const dispatch = useDispatch()
  const { categories, products, orders, loading, saving, error, message } = useSelector(
    (state) => state.admin,
  )

  const [categoryForm, setCategoryForm] = useState(defaultCategory)
  const [categoryEditId, setCategoryEditId] = useState('')
  const [productForm, setProductForm] = useState(defaultProduct)
  const [productEditId, setProductEditId] = useState('')
  const [imageFiles, setImageFiles] = useState([])
  const [uploadingImage, setUploadingImage] = useState(false)
  const [uploadMessage, setUploadMessage] = useState('')

  useEffect(() => {
    dispatch(fetchAdminCatalog())
  }, [dispatch])

  useEffect(() => {
    if (!productForm.category && categories[0]) {
      setProductForm((current) => ({
        ...current,
        category: categories[0].id || categories[0]._id,
      }))
    }
  }, [categories, productForm.category])

  const selectedCategoryName = useMemo(() => {
    const category = categories.find(
      (item) => (item.id || item._id) === productForm.category,
    )
    return category?.name || 'No category'
  }, [categories, productForm.category])

  function populateCategoryForm(category) {
    setCategoryEditId(category.id || category._id)
    setCategoryForm({
      name: category.name || '',
      icon: category.icon || '',
      color: category.color || '#f29a43',
    })
  }

  function populateProductForm(product) {
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
      price: String(product.price || ''),
      category: product.category?.id || product.category?._id || product.category || '',
      countInStock: String(product.countInStock || ''),
      isFeatured: Boolean(product.isFeatured),
    })
    setImageFiles([])
    setUploadMessage('')
  }

  async function submitCategory(event) {
    event.preventDefault()
    dispatch(clearAdminState())

    if (categoryEditId) {
      await dispatch(
        updateCategoryAdmin({ id: categoryEditId, payload: categoryForm }),
      )
    } else {
      await dispatch(createCategoryAdmin(categoryForm))
    }

    setCategoryEditId('')
    setCategoryForm(defaultCategory)
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
      countInStock: Number(productForm.countInStock || 0),
      isFeatured: Boolean(productForm.isFeatured),
    }

    if (productEditId) {
      await dispatch(updateProductAdmin({ id: productEditId, payload }))
    } else {
      await dispatch(createProductAdmin(payload))
    }

    setProductEditId('')
    setProductForm((current) => ({
      ...defaultProduct,
      category: categories[0]?.id || categories[0]?._id || '',
    }))
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

  if (loading) {
    return <LoadingState label="Loading admin dashboard..." />
  }

  if (error && !categories.length && !products.length) {
    return <ErrorState message={error} onRetry={() => dispatch(fetchAdminCatalog())} />
  }

  function handleOrderStatusChange(orderId, status) {
    dispatch(clearAdminState())
    dispatch(updateOrderStatusAdmin({ id: orderId, status }))
  }

  function handleDeleteOrder(orderId, customerEmail, customerName) {
    dispatch(clearAdminState())
    dispatch(deleteOrderAdmin({ id: orderId, customerEmail, customerName }))
  }

  return (
    <section className="page-stack">
      <section className="panel">
        <div className="panel-header">
          <h2>Admin Dashboard</h2>
          <span>{products.length} products</span>
        </div>
        {message ? <p className="form-success">{message}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
      </section>

      <section className="panel admin-grid">
        <form className="admin-form" onSubmit={submitCategory}>
          <h3>{categoryEditId ? 'Update Category' : 'Create Category'}</h3>
          <input
            value={categoryForm.name}
            onChange={(event) =>
              setCategoryForm((current) => ({ ...current, name: event.target.value }))
            }
            placeholder="Category Name"
            required
          />
          <input
            value={categoryForm.icon}
            onChange={(event) =>
              setCategoryForm((current) => ({ ...current, icon: event.target.value }))
            }
            placeholder="Icon"
          />
          <input
            type="color"
            value={categoryForm.color}
            onChange={(event) =>
              setCategoryForm((current) => ({ ...current, color: event.target.value }))
            }
          />
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
                  onClick={() => dispatch(deleteCategoryAdmin(category.id || category._id))}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel admin-grid">
        <form className="admin-form" onSubmit={submitProduct}>
          <h3>{productEditId ? 'Update Product' : 'Create Product'}</h3>
          <input
            value={productForm.name}
            onChange={(event) =>
              setProductForm((current) => ({ ...current, name: event.target.value }))
            }
            placeholder="Product Name"
            required
          />
          <input
            value={productForm.brand}
            onChange={(event) =>
              setProductForm((current) => ({ ...current, brand: event.target.value }))
            }
            placeholder="Brand"
          />
          <input
            value={productForm.image}
            onChange={(event) => handleSingleImageUrlChange(event.target.value.trim())}
            placeholder="Single Image URL"
          />
          <div className="file-upload-row">
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={(event) =>
                setImageFiles(Array.from(event.target.files || []))
              }
            />
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
          <textarea
            value={productForm.description}
            onChange={(event) =>
              setProductForm((current) => ({ ...current, description: event.target.value }))
            }
            placeholder="Description"
            rows={2}
            required
          />
          <textarea
            value={productForm.richDescription}
            onChange={(event) =>
              setProductForm((current) => ({
                ...current,
                richDescription: event.target.value,
              }))
            }
            placeholder="Rich Description"
            rows={2}
          />
          <select
            value={productForm.category}
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
          </select>
          <input
            type="number"
            value={productForm.price}
            onChange={(event) =>
              setProductForm((current) => ({ ...current, price: event.target.value }))
            }
            placeholder="Price"
            required
          />
          <input
            type="number"
            value={productForm.countInStock}
            onChange={(event) =>
              setProductForm((current) => ({ ...current, countInStock: event.target.value }))
            }
            placeholder="Stock"
            required
          />
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
          <button type="submit" className="solid-button" disabled={saving}>
            {productEditId ? 'Save Product' : 'Add Product'}
          </button>
        </form>

        <div className="admin-list">
          <h3>Products</h3>
          {products.map((product) => (
            <article key={product.id || product._id} className="admin-item">
              <div>
                <strong>{product.name}</strong>
                <small>{formatCurrency(product.price)}</small>
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
                  onClick={() => dispatch(deleteProductAdmin(product.id || product._id))}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>Orders</h3>
          <span>{orders.length} total</span>
        </div>
        <div className="admin-list">
          {orders.map((order) => {
            const orderId = order.id || order._id
            const orderUser = order.user
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
                  <small>Subtotal: {formatCurrency(order.totalPrice || 0)}</small>
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
                  <select
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
                  </select>
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
      </section>
    </section>
  )
}

export default AdminDashboardPage