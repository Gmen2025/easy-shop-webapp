import { Link } from 'react-router-dom'
import { formatCurrency, getEntityId, getPrimaryProductImage } from '../utils/format'

function ProductCard({ product }) {
  const productId = getEntityId(product)

  return (
    <Link to={`/products/${productId}`} className="product-card product-card-link">
      <div className="product-image-wrap">
        <img
          src={getPrimaryProductImage(product, 'https://placehold.co/600x400?text=No+Image')}
          alt={product.name}
          className="product-image"
        />
      </div>
      <div className="product-info">
        <p className="product-brand">{product.brand || 'Generic Brand'}</p>
        <h3>{product.name}</h3>
        <div className="product-meta">
          <strong>{formatCurrency(product.price)}</strong>
          <span>{product.countInStock} left</span>
        </div>
      </div>
    </Link>
  )
}

export default ProductCard