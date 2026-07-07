import { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import ProductCard from '../components/ProductCard'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'
import { fetchProducts } from '../features/products/productsSlice'
import { fetchCategories } from '../features/categories/categoriesSlice'
import { getEntityId } from '../utils/format'
import ProductImage from '../components/ProductImage'

const FEATURED_GROUP_SIZE = 4

function chunkProducts(products, size) {
  const groups = []

  for (let index = 0; index < products.length; index += size) {
    groups.push(products.slice(index, index + size))
  }

  return groups
}

function HomePage() {
  const dispatch = useDispatch()
  const [categoryId, setCategoryId] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const { items: products, loading, error } = useSelector((state) => state.products)
  const categories = useSelector((state) => state.categories.items)

  useEffect(() => {
    dispatch(fetchCategories())
  }, [dispatch])

  useEffect(() => {
    dispatch(fetchProducts())
  }, [dispatch])

  const filteredProducts = useMemo(() => {
    if (!categoryId) {
      return products
    }

    return products.filter((product) => {
      const productCategoryId = String(product?.category?.id || product?.category?._id || '')
      return productCategoryId === categoryId
    })
  }, [products, categoryId])

  const visibleProducts = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()

    if (!normalizedQuery) {
      return filteredProducts
    }

    return filteredProducts.filter((product) => {
      const searchTarget = [
        product?.name,
        product?.brand,
        product?.description,
        product?.richDescription,
      ]
        .map((value) => String(value || '').toLowerCase())
        .join(' ')

      return searchTarget.includes(normalizedQuery)
    })
  }, [filteredProducts, searchQuery])

  const featuredProducts = useMemo(
    () => products.filter((product) => Boolean(product?.isFeatured)),
    [products],
  )

  const featuredProductGroups = useMemo(
    () => chunkProducts(featuredProducts, FEATURED_GROUP_SIZE),
    [featuredProducts],
  )

  const productCount = useMemo(() => visibleProducts.length, [visibleProducts])

  return (
    <section className="page-stack">
      {featuredProductGroups.length > 0 ? (
        <section className="panel featured-products-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Featured products</p>
              <h2>Highlighted picks worth checking first</h2>
            </div>
            <span>{featuredProducts.length} featured</span>
          </div>

          <div className="featured-rail" aria-label="Featured products">
            {featuredProductGroups.map((group, index) => (
              <article key={`featured-group-${index + 1}`} className="featured-group-card">
                <div className="featured-group-header">
                  <strong>Featured set {index + 1}</strong>
                  <span>{group.length} items</span>
                </div>
                <div className="featured-group-grid">
                  {group.map((product) => (
                    <ProductImage key={getEntityId(product)} product={product} />
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

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

          <label htmlFor="home-product-search">Search</label>
          <input
            id="home-product-search"
            type="search"
            value={searchQuery}
            placeholder="Search products by name, brand, description"
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>

        {loading && products.length === 0 ? <LoadingState label="Loading products..." /> : null}
        {loading && products.length > 0 ? <p className="section-note">Refreshing products...</p> : null}
        {error ? (
          <ErrorState
            message={error}
            onRetry={() => dispatch(fetchProducts())}
          />
        ) : null}

        {!error ? (
          <div className="products-grid">
            {visibleProducts.map((product) => (
              <ProductCard key={getEntityId(product)} product={product} />
            ))}
          </div>
        ) : null}

        {!error && !loading && visibleProducts.length === 0 ? (
          <p className="section-note">No products match your category and search filters.</p>
        ) : null}
      </section>
    </section>
  )
}

export default HomePage