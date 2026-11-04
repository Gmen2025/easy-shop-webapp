import { inventoryPayload } from './company.js'

export function entityId(value) {
  if (value && typeof value === 'object') return entityId(value._id || value.id || value.$oid)
  return String(value || '')
}

export function ownedByStore(entity, store) {
  const owner = entityId(entity?.createdByStore)
  return Boolean(owner && owner === entityId(store))
}

export function ownerProductPayload(form) {
  const images = [...new Set((form.images || []).filter((image) => typeof image === 'string' && image.trim()))]
  if (!images.length) throw new Error('Upload or add at least one product image before publishing.')
  if (!form.name.trim() || !form.description.trim()) throw new Error('Product name and description are required.')
  return {
    name: form.name.trim(), description: form.description.trim(), brand: form.brand.trim(),
    richDescription: form.richDescription, category: entityId(form.category), image: images[0], images,
    ...inventoryPayload({ price: form.price, countInStock: form.countInStock, minStock: form.minStock }),
  }
}

export function catalogNotificationWarnings(payload) {
  const warnings = Array.isArray(payload?.notificationWarnings) ? payload.notificationWarnings : []
  return [...new Set([...warnings, payload?.notification?.error].filter((warning) => typeof warning === 'string' && warning.trim()))]
}

export function customerCoordinates(value) {
  const coordinates = value?.location?.coordinates || value?.coordinates
  const latitude = coordinates ? coordinates[1] : value?.latitude
  const longitude = coordinates ? coordinates[0] : value?.longitude
  if ([latitude, longitude].some((coordinate) =>
    !['string', 'number'].includes(typeof coordinate) || String(coordinate).trim() === '')) return null
  const lat = Number(latitude), lng = Number(longitude)
  return Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lng) && Math.abs(lng) <= 180
    ? { latitude: lat, longitude: lng } : null
}

export function catalogSettings(payload) {
  if (typeof payload?.nearestStorePricingEnabled !== 'boolean') {
    throw new Error('Catalog pricing settings are unavailable. Retry before shopping.')
  }
  return payload
}

export function nearestStoreProduct(payload, productId) {
  const product = payload?.product, store = payload?.store
  if (entityId(product) !== entityId(productId) || !entityId(store) ||
      entityId(product?.storefrontId) !== entityId(store) || product?.inventoryManaged !== true ||
      typeof payload?.distanceKm !== 'number' || !Number.isFinite(payload.distanceKm) || payload.distanceKm < 0 ||
      !store?.name || typeof product.price !== 'number' || !Number.isFinite(product.price) || product.price < 0 ||
      typeof product.countInStock !== 'number' || !Number.isFinite(product.countInStock) || product.countInStock < 0) {
    throw new Error('The server did not return valid store pricing. Retry; no catalog price will be used.')
  }
  return { ...product, storefrontName: store.name }
}

export function unresolvedCartItems(items) {
  return items.filter((item) => !entityId(item.product?.storefrontId))
}

export function unscopedProductQuote(checkout) {
  return checkout?.status === 'quote' && checkout.kind !== 'service' &&
    (!Array.isArray(checkout.cart) || checkout.cart.some((line) => !entityId(line.storefrontId)))
}

export function selectCatalogProducts(products, { categoryId, searchQuery, filters }, hidePrice) {
  const query = searchQuery.trim().toLowerCase()
  const minPrice = filters.minPrice === '' ? null : Number(filters.minPrice)
  const maxPrice = filters.maxPrice === '' ? null : Number(filters.maxPrice)
  const minRating = filters.minRating === 'all' ? null : Number(filters.minRating)
  const result = products.filter((product) => {
    if (categoryId && entityId(product.category) !== categoryId) return false
    const searchable = [product.name, product.description, product.richDescription, product.brand]
      .map((value) => String(value || '').toLowerCase()).join(' ')
    if (query && !searchable.includes(query)) return false
    if (!hidePrice && minPrice !== null && Number(product.price || 0) < minPrice) return false
    if (!hidePrice && maxPrice !== null && Number(product.price || 0) > maxPrice) return false
    if (filters.brand !== 'all' && product.brand !== filters.brand) return false
    if (minRating !== null && Number(product.rating || 0) < minRating) return false
    if (!hidePrice && filters.inStockOnly && Number(product.countInStock || 0) <= 0) return false
    return true
  })
  if (!hidePrice && filters.sortBy === 'priceAsc') result.sort((a, b) => Number(a.price || 0) - Number(b.price || 0))
  if (!hidePrice && filters.sortBy === 'priceDesc') result.sort((a, b) => Number(b.price || 0) - Number(a.price || 0))
  if (filters.sortBy === 'ratingDesc') result.sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0))
  if (filters.sortBy === 'nameAsc') result.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
  return result
}
