import { useDispatch } from 'react-redux'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { addToCart } from '../features/cart/cartSlice'
import { formatCurrency, getEntityId, getPrimaryProductImage } from '../utils/format'

function ProductCard({ product, storeInventory = false }) {
  const dispatch = useDispatch()
  const productId = getEntityId(product)
  const stock = Number(product.countInStock || 0)

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
            <span className={`product-stock-badge${stock > 0 ? '' : ' out-of-stock'}`}>
              {stock > 0 ? `${stock} left` : 'Out of stock'}
            </span>
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
          <span className={`product-stock-badge${stock > 0 ? '' : ' out-of-stock'}`}>
            {stock > 0 ? `${stock} left` : 'Out of stock'}
          </span>
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
        {Number(product.rating || 0) > 0 ? (
          <p className="product-rating" aria-label={`${Number(product.rating).toFixed(1)} out of 5 stars`}>
            <span aria-hidden="true">★</span> {Number(product.rating).toFixed(1)}
            {Number(product.numReviews || 0) > 0 ? ` (${product.numReviews})` : ''}
          </p>
        ) : null}
        <div className="product-meta">
          <strong>{formatCurrency(product.price)}</strong>
        </div>
        <button
            type="button"
            className="product-add-button"
            disabled={stock <= 0}
            onClick={() => {
              dispatch(addToCart({ product, quantity: 1 }))
              toast.success(`${product.name} added to your cart`)
            }}
          >
            {stock > 0 ? 'Add to cart' : 'Unavailable'}
        </button>
      </div>
    </article>
  )
}

export default ProductCard