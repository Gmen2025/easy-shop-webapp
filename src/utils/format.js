export function formatCurrency(value) {
  const db = localStorage.getItem('selectedDatabaseName') || 'E_Shopping'
  const isEthio = db === 'E_Shopping'
  return new Intl.NumberFormat(isEthio ? 'en-ET' : 'en-US', {
    style: 'currency',
    currency: isEthio ? 'ETB' : 'USD',
    currencyDisplay: 'symbol',
    maximumFractionDigits: 2,
  }).format(Number(value || 0))
}

export function getEntityId(entity) {
  return entity?.id || entity?._id || ''
}

export function getPrimaryProductImage(product, fallback = 'https://placehold.co/600x400?text=No+Image') {
  if (!product) {
    return fallback
  }

  if (Array.isArray(product.images) && product.images.length > 0) {
    const firstValidImage = product.images.find((image) => typeof image === 'string' && image.trim())
    if (firstValidImage) {
      return firstValidImage
    }
  }

  if (typeof product.image === 'string' && product.image.trim()) {
    return product.image
  }

  return fallback
}