import { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import ProductCard from '../components/ProductCard'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'
import { fetchProducts } from '../features/products/productsSlice'
import { fetchCategories } from '../features/categories/categoriesSlice'
import { getEntityId, getPrimaryProductImage } from '../utils/format'
import heroGraphic from '../assets/hero.png'

const initialFilters = {
  minPrice: '',
  maxPrice: '',
  brand: 'all',
  minRating: 'all',
  inStockOnly: false,
  sortBy: 'relevance',
}

function getCategoryId(product) {
  const category = product?.category
  const id = category?._id || category?.id || category
  if (id && typeof id === 'object') {
    return String(id.$oid || id._id || '')
  }
  return String(id || '')
}

function getCategoryEntityId(category) {
  const id = category?._id || category?.id || ''
  return String(id && typeof id === 'object' ? id.$oid || id._id || '' : id)
}

function HomePage() {
  const dispatch = useDispatch()
  const [categoryId, setCategoryId] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState(initialFilters)
  const homeGeneralGraphicUrl = String(import.meta.env.VITE_HOME_GENERAL_GRAPHIC_URL || '').trim()
  const homeGraphicSource = homeGeneralGraphicUrl || heroGraphic

  const { items: products, loading, error } = useSelector((state) => state.products)
  const { items: categories } = useSelector((state) => state.categories)

  useEffect(() => {
    dispatch(fetchCategories())
    dispatch(fetchProducts())
  }, [dispatch])

  const brands = useMemo(
    () => [...new Set(products.map((product) => product.brand).filter(Boolean))].sort(),
    [products],
  )

  const featuredProducts = useMemo(
    () => products.filter((product) => Boolean(product?.isFeatured) && Number(product.countInStock || 0) > 0),
    [products],
  )

  const visibleProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const minPrice = filters.minPrice === '' ? null : Number(filters.minPrice)
    const maxPrice = filters.maxPrice === '' ? null : Number(filters.maxPrice)
    const minRating = filters.minRating === 'all' ? null : Number(filters.minRating)

    const result = products.filter((product) => {
      if (categoryId && getCategoryId(product) !== categoryId) return false
      if (query) {
        const searchable = [product.name, product.description, product.richDescription, product.brand]
          .map((value) => String(value || '').toLowerCase())
          .join(' ')
        if (!searchable.includes(query)) return false
      }

      const price = Number(product.price || 0)
      if (minPrice !== null && price < minPrice) return false
      if (maxPrice !== null && price > maxPrice) return false
      if (filters.brand !== 'all' && product.brand !== filters.brand) return false
      if (minRating !== null && Number(product.rating || 0) < minRating) return false
      if (filters.inStockOnly && Number(product.countInStock || 0) <= 0) return false
      return true
    })

    if (filters.sortBy === 'priceAsc') result.sort((a, b) => Number(a.price || 0) - Number(b.price || 0))
    if (filters.sortBy === 'priceDesc') result.sort((a, b) => Number(b.price || 0) - Number(a.price || 0))
    if (filters.sortBy === 'ratingDesc') result.sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0))
    if (filters.sortBy === 'nameAsc') result.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
    return result
  }, [products, categoryId, searchQuery, filters])

  function updateFilter(event) {
    const { name, value, type, checked } = event.target
    setFilters((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }))
  }

  return (
    <section className="page-stack shop-page">
      <section className="panel home-graphic-panel" aria-label="Featured collection">
        <img
          src={homeGraphicSource}
          alt="AdduGenetE Shop featured collection"
          className="home-graphic-image"
          loading="lazy"
          onError={(event) => {
            if (event.currentTarget.dataset.fallbackApplied === 'true') return
            event.currentTarget.dataset.fallbackApplied = 'true'
            event.currentTarget.src = heroGraphic
          }}
        />
      </section>

      <section className="shop-welcome">
        <div>
          <p className="eyebrow">Addu Genet Easy Shop</p>
          <h1>Find something you&apos;ll love.</h1>
          <p>Browse products from your region, compare your options, and shop with confidence.</p>
        </div>
        <a className="solid-button" href="#catalog">Explore products</a>
      </section>

      <section className="category-section" aria-labelledby="categories-heading">
        <div className="shop-section-heading">
          <div>
            <p className="eyebrow">Browse by department</p>
            <h2 id="categories-heading">Categories</h2>
          </div>
          <span>{categories.length} categories</span>
        </div>
        <div className="category-rail">
          <button
            type="button"
            className={`category-chip${!categoryId ? ' active' : ''}`}
            onClick={() => setCategoryId('')}
            aria-pressed={!categoryId}
          >
            <span className="category-art category-all" aria-hidden="true">✦</span>
            <span>All</span>
          </button>
          {categories.map((category) => {
            const id = getCategoryEntityId(category)
            const image = category.image || products.find((product) => getCategoryId(product) === id)
            const imageUrl = typeof image === 'string' ? image : image ? getPrimaryProductImage(image, '') : ''
            return (
              <button
                type="button"
                key={id}
                className={`category-chip${categoryId === id ? ' active' : ''}`}
                onClick={() => setCategoryId(id)}
                aria-pressed={categoryId === id}
              >
                <span className="category-art">
                  {imageUrl ? <img src={imageUrl} alt="" loading="lazy" /> : <span aria-hidden="true">◆</span>}
                </span>
                <span>{category.name}</span>
              </button>
            )
          })}
        </div>
      </section>

      {featuredProducts.length > 0 ? (
        <section className="featured-products-panel panel">
          <div className="shop-section-heading">
            <div>
              <p className="eyebrow">Picked for you</p>
              <h2>Featured products</h2>
            </div>
            <span>{featuredProducts.length} picks</span>
          </div>
          <div className="featured-rail">
            {featuredProducts.slice(0, 8).map((product) => (
              <ProductCard key={getEntityId(product)} product={product} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="panel catalog-panel" id="catalog">
        <div className="shop-section-heading catalog-heading">
          <div>
            <p className="eyebrow">Shop the collection</p>
            <h2>All products</h2>
          </div>
          <span>{visibleProducts.length} products</span>
        </div>
        <div className="catalog-search-row">
          <label className="catalog-search">
            <span className="visually-hidden">Search products</span>
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={searchQuery}
              placeholder="Search products, brands, and more"
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </label>
          <button
            type="button"
            className={`filter-toggle${showFilters ? ' active' : ''}`}
            aria-expanded={showFilters}
            aria-controls="advanced-product-filters"
            onClick={() => setShowFilters((visible) => !visible)}
          >
            <span aria-hidden="true">☷</span> Filters
          </button>
        </div>

        {showFilters ? (
          <div className="advanced-filters" id="advanced-product-filters">
            <label>
              Min price
              <input name="minPrice" type="number" min="0" value={filters.minPrice} onChange={updateFilter} />
            </label>
            <label>
              Max price
              <input name="maxPrice" type="number" min="0" value={filters.maxPrice} onChange={updateFilter} />
            </label>
            <label>
              Brand
              <select name="brand" value={filters.brand} onChange={updateFilter}>
                <option value="all">All brands</option>
                {brands.map((brand) => <option key={brand} value={brand}>{brand}</option>)}
              </select>
            </label>
            <label>
              Minimum rating
              <select name="minRating" value={filters.minRating} onChange={updateFilter}>
                <option value="all">Any rating</option>
                {[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating}{rating === 5 ? '' : '+'} stars</option>)}
              </select>
            </label>
            <label>
              Sort by
              <select name="sortBy" value={filters.sortBy} onChange={updateFilter}>
                <option value="relevance">Relevance</option>
                <option value="priceAsc">Price: low to high</option>
                <option value="priceDesc">Price: high to low</option>
                <option value="ratingDesc">Top rated</option>
                <option value="nameAsc">Name: A to Z</option>
              </select>
            </label>
            <label className="stock-filter">
              <input name="inStockOnly" type="checkbox" checked={filters.inStockOnly} onChange={updateFilter} />
              In stock only
            </label>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setFilters(initialFilters)
                setCategoryId('')
                setSearchQuery('')
              }}
            >
              Reset filters
            </button>
          </div>
        ) : null}

        {loading && products.length === 0 ? <LoadingState label="Loading products..." /> : null}
        {loading && products.length > 0 ? <p className="section-note">Refreshing products...</p> : null}
        {error ? <ErrorState message={error} onRetry={() => dispatch(fetchProducts())} /> : null}
        {!error ? (
          <div className="products-grid">
            {visibleProducts.map((product) => <ProductCard key={getEntityId(product)} product={product} />)}
          </div>
        ) : null}
        {!error && !loading && visibleProducts.length === 0 ? (
          <p className="empty-state">No products match these filters. Try changing your search or category.</p>
        ) : null}
      </section>
    </section>
  )
}

export default HomePage
