const LOW_STOCK_THRESHOLD_KEY = 'lowStockThreshold'
const DEFAULT_LOW_STOCK_THRESHOLD = 5
const INVENTORY_OVERRIDES_KEY = 'inventoryStockOverrides'

function hasLocalStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function toProductId(entity) {
  return String(entity?.id || entity?._id || entity?.productId || '')
}

function getInventoryOverridesMap() {
  if (!hasLocalStorage()) {
    return {}
  }

  const raw = window.localStorage.getItem(INVENTORY_OVERRIDES_KEY)
  if (!raw) {
    return {}
  }

  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveInventoryOverridesMap(overrides) {
  if (!hasLocalStorage()) {
    return
  }

  window.localStorage.setItem(INVENTORY_OVERRIDES_KEY, JSON.stringify(overrides))
}

export function normalizeLowStockThreshold(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return DEFAULT_LOW_STOCK_THRESHOLD
  }

  return Math.max(1, Math.trunc(parsed))
}

export function getLowStockThreshold() {
  if (!hasLocalStorage()) {
    return DEFAULT_LOW_STOCK_THRESHOLD
  }

  const raw = window.localStorage.getItem(LOW_STOCK_THRESHOLD_KEY)
  if (!raw) {
    return DEFAULT_LOW_STOCK_THRESHOLD
  }

  return normalizeLowStockThreshold(raw)
}

export function setLowStockThreshold(value) {
  const normalized = normalizeLowStockThreshold(value)
  if (hasLocalStorage()) {
    window.localStorage.setItem(LOW_STOCK_THRESHOLD_KEY, String(normalized))
  }
  return normalized
}

export function saveInventoryStockOverrides(updates) {
  const nextOverrides = { ...getInventoryOverridesMap() }
  const normalizedUpdates = Array.isArray(updates) ? updates : []

  for (const update of normalizedUpdates) {
    const productId = toProductId(update)
    const remainingStock = Number(update?.remainingStock)

    if (!productId || !Number.isFinite(remainingStock)) {
      continue
    }

    nextOverrides[productId] = Math.max(0, Math.trunc(remainingStock))
  }

  saveInventoryOverridesMap(nextOverrides)
}

export function applyInventoryOverride(product) {
  if (!product || typeof product !== 'object') {
    return product
  }

  const productId = toProductId(product)
  if (!productId) {
    return product
  }

  const overrides = getInventoryOverridesMap()
  if (!(productId in overrides)) {
    return product
  }

  return {
    ...product,
    countInStock: Number(overrides[productId] || 0),
  }
}

export function applyInventoryOverrides(products) {
  if (!Array.isArray(products)) {
    return products
  }

  return products.map((product) => applyInventoryOverride(product))
}

export { DEFAULT_LOW_STOCK_THRESHOLD }