import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { fetchProductById } from '../features/products/productsSlice'
import { addToCart } from '../features/cart/cartSlice'
import { apiRequest } from '../api/client'
import ProductCard from '../components/ProductCard'
import { applyInventoryOverrides } from '../utils/inventory'
import { formatCurrency, getEntityId, getPrimaryProductImage } from '../utils/format'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'

function normalizeProductsPayload(payload) {
  return Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.products)
      ? payload.products
      : Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload?.data?.products)
          ? payload.data.products
          : []
}

function normalizeBrand(brand) {
  return String(brand || '').trim().toLowerCase()
}

function ProductDetailsPage() {
  const { id } = useParams()
  const dispatch = useDispatch()
  const { selectedProduct, loading, error } = useSelector((state) => state.products)
  const [quantity, setQuantity] = useState(1)
  const [selectedImage, setSelectedImage] = useState('')
  const [relatedProducts, setRelatedProducts] = useState([])
  const [relatedLoading, setRelatedLoading] = useState(false)

  useEffect(() => {
    dispatch(fetchProductById(id))
  }, [dispatch, id])

  useEffect(() => {
    setSelectedImage('')
  }, [id])

  useEffect(() => {
    let isCancelled = false

    async function loadRelatedProducts() {
      if (!selectedProduct) {
        setRelatedProducts([])
        return
      }

      const selectedCategoryId = String(
        selectedProduct?.category?.id || selectedProduct?.category?._id || '',
      )
      const selectedProductId = String(getEntityId(selectedProduct))
      const selectedBrand = normalizeBrand(selectedProduct?.brand)

      setRelatedLoading(true)

      try {
        const payload = await apiRequest('/products')
        const normalizedProducts = applyInventoryOverrides(normalizeProductsPayload(payload))

        const rankedProducts = normalizedProducts
          .filter((product) => String(getEntityId(product)) !== selectedProductId)
          .map((product) => {
            const productCategoryId = String(product?.category?.id || product?.category?._id || '')
            const productBrand = normalizeBrand(product?.brand)
            const sameCategory = selectedCategoryId && productCategoryId === selectedCategoryId
            const sameBrand = selectedBrand && productBrand === selectedBrand

            return {
              product,
              isFeatured: Boolean(product?.isFeatured),
              sameCategory,
              sameBrand,
              matchesEither: Boolean(sameCategory || sameBrand),
              matchesBoth: Boolean(sameCategory && sameBrand),
            }
          })

        const hasSpecificMatches = rankedProducts.some((item) => item.matchesEither)
        const pool = hasSpecificMatches
          ? rankedProducts.filter((item) => item.matchesEither)
          : rankedProducts

        const nextRelatedProducts = pool
          .sort((firstItem, secondItem) => {
            if (firstItem.isFeatured !== secondItem.isFeatured) {
              return Number(secondItem.isFeatured) - Number(firstItem.isFeatured)
            }
            if (firstItem.matchesBoth !== secondItem.matchesBoth) {
              return Number(secondItem.matchesBoth) - Number(firstItem.matchesBoth)
            }
            if (firstItem.sameCategory !== secondItem.sameCategory) {
              return Number(secondItem.sameCategory) - Number(firstItem.sameCategory)
            }
            if (firstItem.sameBrand !== secondItem.sameBrand) {
              return Number(secondItem.sameBrand) - Number(firstItem.sameBrand)
            }

            return String(firstItem.product?.name || '').localeCompare(String(secondItem.product?.name || ''))
          })
          .map((item) => item.product)
          .slice(0, 4)

        if (!isCancelled) {
          setRelatedProducts(nextRelatedProducts)
        }
      } catch {
        if (!isCancelled) {
          setRelatedProducts([])
        }
      } finally {
        if (!isCancelled) {
          setRelatedLoading(false)
        }
      }
    }

    loadRelatedProducts()

    return () => {
      isCancelled = true
    }
  }, [selectedProduct])

  if (loading) {
    return <LoadingState label="Loading product details..." />
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => dispatch(fetchProductById(id))} />
  }

  if (!selectedProduct) {
    return <ErrorState message="Product not found." />
  }

  const stock = selectedProduct.countInStock || 0
  const productImages = [
    ...(Array.isArray(selectedProduct.images) ? selectedProduct.images : []),
    selectedProduct.image,
  ].filter((image, index, array) => typeof image === 'string' && image.trim() && array.indexOf(image) === index)
  const hasSelectedImage = selectedImage && productImages.includes(selectedImage)
  const primaryImage =
    (hasSelectedImage ? selectedImage : '') ||
    productImages[0] ||
    getPrimaryProductImage(selectedProduct, 'https://placehold.co/800x500?text=No+Image')

  return (
    <section className="page-stack">
      <section className="panel details-panel">
        <div className="details-image-column">
          <img
            src={primaryImage}
            alt={selectedProduct.name}
            className="details-image"
          />
          {productImages.length > 1 ? (
            <div className="details-thumbnails">
              {productImages.map((imageUrl) => (
                <button
                  key={imageUrl}
                  type="button"
                  className={`thumb-button ${primaryImage === imageUrl ? 'active' : ''}`}
                  onClick={() => setSelectedImage(imageUrl)}
                  aria-label={`View image for ${selectedProduct.name}`}
                >
                  <img src={imageUrl} alt={selectedProduct.name} />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="details-content">
          <p className="eyebrow">{selectedProduct.brand || 'Featured Product'}</p>
          <h2>{selectedProduct.name}</h2>
          <p>{selectedProduct.richDescription || selectedProduct.description}</p>
          <p className="price-tag">{formatCurrency(selectedProduct.price)}</p>

          <div className="details-actions">
            <label htmlFor="qty">Qty</label>
            <input
              id="qty"
              type="number"
              min="1"
              max={stock || 1}
              value={quantity}
              onChange={(event) => setQuantity(Number(event.target.value || 1))}
            />
            <button
              type="button"
              className="solid-button"
              disabled={stock < 1}
              onClick={() => {
                dispatch(addToCart({ product: selectedProduct, quantity }))
                toast.success(`${selectedProduct.name} added to cart!`)
              }}
            >
              Add To Cart
            </button>
          </div>
          <small>{stock > 0 ? `${stock} in stock` : 'Out of stock'}</small>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Related Products</h2>
          <span>{relatedProducts.length} items</span>
        </div>

        {relatedLoading ? <p className="section-note">Loading related products...</p> : null}

        {!relatedLoading && relatedProducts.length === 0 ? (
          <p className="section-note">No related products found for this product.</p>
        ) : null}

        {relatedProducts.length > 0 ? (
          <div className="products-grid">
            {relatedProducts.map((product) => (
              <ProductCard key={getEntityId(product)} product={product} />
            ))}
          </div>
        ) : null}
      </section>
    </section>
  )
}

export default ProductDetailsPage