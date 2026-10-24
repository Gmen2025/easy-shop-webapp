import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getStores } from '../api/storefronts'
import ErrorState from '../components/ErrorState'
import LoadingState from '../components/LoadingState'

function StoreDirectoryPage() {
  const [stores, setStores] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let current = true
    getStores()
      .then((result) => {
        if (current) setStores(Array.isArray(result) ? result.filter((store) => !store.parentStore) : [])
      })
      .catch((requestError) => {
        if (current) setError(requestError.message || 'Unable to load stores.')
      })
      .finally(() => {
        if (current) setLoading(false)
      })
    return () => {
      current = false
    }
  }, [])

  if (loading && stores.length === 0) return <LoadingState label="Finding stores..." />
  if (error && stores.length === 0) {
    return <ErrorState message={error} onRetry={() => window.location.reload()} />
  }

  return (
    <section className="page-stack">
      <section className="shop-welcome">
        <div>
          <p className="eyebrow">Local shopping</p>
          <h1>Shop by store</h1>
          <p>Explore approved stores and discover what is available near you.</p>
        </div>
      </section>
      {error ? <p className="form-error">{error}</p> : null}
      {stores.length === 0 ? (
        <section className="panel empty-state">No stores are available right now.</section>
      ) : (
        <div className="store-grid">
          {stores.map((store) => (
            <article className="store-card" key={store._id}>
              {store.logo ? <img src={store.logo} alt="" className="store-logo" loading="lazy" /> : (
                <div className="store-logo store-logo-placeholder" aria-hidden="true">AG</div>
              )}
              <div className="store-details">
                <p className="eyebrow">Addu Genet partner</p>
                <h2>{store.name}</h2>
                <p>{store.address || 'Address not provided'}</p>
                {store.description ? <p>{store.description}</p> : null}
                <Link className="solid-button" to={`/stores/${store._id}`}>Browse store</Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export default StoreDirectoryPage
