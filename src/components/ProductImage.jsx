import { Link } from 'react-router-dom'
import { formatCurrency, getEntityId, getPrimaryProductImage } from '../utils/format'

function ProductImage({ product }) {
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
    </Link>
  )
}

export default ProductImage