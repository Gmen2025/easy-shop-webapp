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