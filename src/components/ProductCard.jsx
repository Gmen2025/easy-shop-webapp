import { Link } from 'react-router-dom'
import { formatCurrency, getEntityId } from '../utils/format'

function ProductCard({ product }) {
  const productId = getEntityId(product)

  return (
    <article className="product-card">
      <Link to={`/products/${productId}`} className="product-image-wrap">
        <img
          src={product.image || 'https://placehold.co/600x400?text=No+Image'}
          alt={product.name}
          className="product-image"
        />
      </Link>
      <div className="product-info">
        <p className="product-brand">{product.brand || 'Generic Brand'}</p>
        <h3>{product.name}</h3>
        <p className="product-description">{product.description}</p>
        <div className="product-meta">
          <strong>{formatCurrency(product.price)}</strong>
          <span>{product.countInStock} left</span>
        </div>
      </div>
    </article>
  )
}

export default ProductCard