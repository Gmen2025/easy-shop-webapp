import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { fetchProductById } from '../features/products/productsSlice'
import { addToCart } from '../features/cart/cartSlice'
import { formatCurrency, getPrimaryProductImage } from '../utils/format'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'

function ProductDetailsPage() {
  const { id } = useParams()
  const dispatch = useDispatch()
  const { selectedProduct, loading, error } = useSelector((state) => state.products)
  const [quantity, setQuantity] = useState(1)
  const [selectedImage, setSelectedImage] = useState('')

  useEffect(() => {
    dispatch(fetchProductById(id))
  }, [dispatch, id])

  useEffect(() => {
    setSelectedImage('')
  }, [selectedProduct?.id, selectedProduct?._id])

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
  const primaryImage =
    selectedImage ||
    productImages[0] ||
    getPrimaryProductImage(selectedProduct, 'https://placehold.co/800x500?text=No+Image')

  return (
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
  )
}

export default ProductDetailsPage