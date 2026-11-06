import { useDispatch } from 'react-redux'
import { useContext, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { addToCart } from '../features/cart/cartSlice'
import { formatCurrency, getEntityId, getPrimaryProductImage } from '../utils/format'
import useCatalogPricing from '../features/products/useCatalogPricing'
import { ReviewAvailabilityContext } from '../api/reviews'
import { productRating, productReviewCount } from '../utils/catalogPricing'

function ProductCard({ product, storeInventory = false }) {
  const dispatch = useDispatch()
  const pricing = useCatalogPricing()
  const { settings } = useContext(ReviewAvailabilityContext)
  const rating = productRating(product)
  const reviewCount = productReviewCount(product)
  const hidePrice = !storeInventory && (pricing.status !== 'ready' || pricing.enabled)
  const productId = getEntityId(product)
  const stock = Number(product.countInStock || 0)
  const [adding, setAdding] = useState(false)

  return (
    <article className="product-card">
      {storeInventory ? (
        <div className="product-card-link">
          <div className="product-image-wrap">
            <img
              src={getPrimaryProductImage(product, 'https://placehold.co/600x400?text=No+Image')}
              alt={product.name}
              className="product-image"
              loading="lazy"
            />
            {!hidePrice ? <span className={`product-stock-badge${stock > 0 ? '' : ' out-of-stock'}`}>
              {stock > 0 ? `${stock} left` : 'Out of stock'}
            </span> : null}
          </div>
        </div>
      ) : (
        <Link to={`/products/${productId}`} className="product-card-link">
        <div className="product-image-wrap">
          <img
            src={getPrimaryProductImage(product, 'https://placehold.co/600x400?text=No+Image')}
            alt={product.name}
            className="product-image"
            loading="lazy"
          />
          {!hidePrice ? <span className={`product-stock-badge${stock > 0 ? '' : ' out-of-stock'}`}>
            {stock > 0 ? `${stock} left` : 'Out of stock'}
          </span> : null}
        </div>
        </Link>
      )}
      <div className="product-info">
        <p className="product-brand">{product.brand || 'Generic Brand'}</p>
        {storeInventory ? <h3>{product.name}</h3> : (
          <Link to={`/products/${productId}`} className="product-title-link">
            <h3>{product.name}</h3>
          </Link>
        )}
        {settings?.products && rating > 0 ? (
          <p className="product-rating" aria-label={`${rating.toFixed(1)} out of 5 stars`}>
            <span aria-hidden="true">★</span> {rating.toFixed(1)}
            {reviewCount > 0 ? ` (${reviewCount})` : ''}
          </p>
        ) : null}
        <div className="product-meta">
          {hidePrice ? <Link to={`/products/${productId}`}>Choose location for store price</Link> : <strong>{formatCurrency(product.price)}</strong>}
        </div>
        {!hidePrice ? <button
            type="button"
            className="product-add-button"
            disabled={stock <= 0 || adding}
            onClick={async () => {
              setAdding(true)
              try {
                if (!storeInventory) {
                  const latest = await pricing.reload()
                  if (!latest) { toast.error('Pricing settings could not be verified. Retry before adding this product.'); return }
                  if (latest.nearestStorePricingEnabled) { toast.error('Choose your location on product details to get the store price.'); return }
                }
                dispatch(addToCart({ product, quantity: 1 }))
                toast.success(`${product.name} added to your cart`)
              } finally { setAdding(false) }
            }}
          >
            {stock > 0 ? 'Add to cart' : 'Unavailable'}
        </button> : null}
      </div>
    </article>
  )
}

export default ProductCard