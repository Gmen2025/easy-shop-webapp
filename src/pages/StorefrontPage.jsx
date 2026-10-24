import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getStorefront } from '../api/storefronts'
import ErrorState from '../components/ErrorState'
import LoadingState from '../components/LoadingState'
import ProductCard from '../components/ProductCard'
import { getEntityId } from '../utils/format'

function StorefrontPage() {
  const { id } = useParams()
  const [storefront, setStorefront] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let current = true
    getStorefront(id)
      .then((result) => {
        if (current) {
          setStorefront(result)
          setError('')
        }
      })
      .catch((requestError) => {
        if (current) setError(requestError.message || 'Unable to load this storefront.')
      })
      .finally(() => {
        if (current) setLoading(false)
      })
    return () => {
      current = false
    }
  }, [id])

  if (loading) return <LoadingState label="Loading storefront..." />
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />

  const store = storefront?.store
  const products = Array.isArray(storefront?.products) ? storefront.products : []

  return (
    <section className="page-stack">
      <Link to="/stores" className="back-link">← All stores</Link>
      <section className="storefront-banner">
        {store?.logo ? <img src={store.logo} alt="" className="store-logo" /> : null}
        <div>
          <p className="eyebrow">Storefront</p>
          <h1>{store?.name || 'Store products'}</h1>
          <p>{store?.address}</p>
          {store?.description ? <p>{store.description}</p> : null}
          <small>Fulfilled by this store or an eligible branch. Available stock reflects matching-price branches.</small>
        </div>
      </section>
      <section className="panel">
        <div className="shop-section-heading">
          <div>
            <p className="eyebrow">Available here</p>
            <h2>Store products</h2>
          </div>
          <span>{products.length} products</span>
        </div>
        {products.length ? (
          <div className="products-grid store-products-grid">
            {products.map((product) => (
              <ProductCard key={getEntityId(product)} product={product} storeInventory />
            ))}
          </div>
        ) : (
          <p className="empty-state">This store has no products available right now.</p>
        )}
      </section>
    </section>
  )
}

export default StorefrontPage
