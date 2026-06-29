import { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import ProductCard from '../components/ProductCard'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'
import { fetchProducts } from '../features/products/productsSlice'
import { fetchCategories } from '../features/categories/categoriesSlice'
import { getEntityId } from '../utils/format'

function HomePage() {
  const dispatch = useDispatch()
  const [categoryId, setCategoryId] = useState('')

  const { items: products, loading, error } = useSelector((state) => state.products)
  const categories = useSelector((state) => state.categories.items)

  useEffect(() => {
    dispatch(fetchCategories())
  }, [dispatch])

  useEffect(() => {
    dispatch(fetchProducts({ categoryId }))
  }, [dispatch, categoryId])

  const productCount = useMemo(() => products.length, [products])

  return (
    <section className="page-stack">
      <section className="hero-panel">
        <p className="eyebrow">Fresh arrivals every week</p>
        <h1>Shop smarter with your own API-powered storefront.</h1>
        <p>
          This website uses Easy Shop backend endpoints for products, categories,
          authentication, and orders.
        </p>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Catalog</h2>
          <span>{productCount} products</span>
        </div>
        <div className="filters">
          <label htmlFor="category">Category</label>
          <select
            id="category"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="">All Categories</option>
            {categories.map((category) => (
              <option key={getEntityId(category)} value={getEntityId(category)}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        {loading && products.length === 0 ? <LoadingState label="Loading products..." /> : null}
        {loading && products.length > 0 ? <p className="section-note">Refreshing products...</p> : null}
        {error ? (
          <ErrorState
            message={error}
            onRetry={() => dispatch(fetchProducts({ categoryId }))}
          />
        ) : null}

        {!error ? (
          <div className="products-grid">
            {products.map((product) => (
              <ProductCard key={getEntityId(product)} product={product} />
            ))}
          </div>
        ) : null}
      </section>
    </section>
  )
}

export default HomePage