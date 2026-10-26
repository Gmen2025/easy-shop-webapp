export const COMPANY_PERIODS = [
  ['daily', '24 Hours'], ['weekly', '7 Days'], ['monthly', '30 Days'],
  ['quarterly', '90 Days'], ['yearly', '365 Days'],
]

export function companyRoles(profile = {}, fallback = {}) {
  return Object.fromEntries(['isDriver', 'isCompanyOwnedDriver', 'isStoreOwner', 'isCompanyOwnedStore']
    .map((key) => [key, profile[key] ?? fallback[key] ?? false]))
}

export const isCompanyDriver = (user) =>
  Boolean(user?.isDriver && user?.isCompanyOwnedDriver && !user?.isAdmin)
export const isDeliveryDriver = (user) => Boolean(user?.isDriver && !user?.isAdmin)
export const isCompanyStoreOwner = (user) =>
  Boolean(user?.isStoreOwner && user?.isCompanyOwnedStore && !user?.isAdmin)

export function companyTabs(user) {
  return [
    { to: '/', label: 'Shop', icon: 'home', end: true },
    isCompanyStoreOwner(user) ? { to: '/store-owner', label: 'Store Owner', icon: 'store' }
      : { to: '/stores', label: 'Stores', icon: 'store' },
    { to: '/cart', label: 'Cart', icon: 'cart' },
    ...(isDeliveryDriver(user) ? [{ to: '/driver', label: isCompanyDriver(user) ? 'Company Driver' : 'Driver', icon: 'driver' }] : []),
    { to: user ? '/profile' : '/login', label: 'Account', icon: 'account' },
  ]
}

export function requireList(value, label) {
  if (!Array.isArray(value) || value.some((entry) => !entry || typeof entry !== 'object')) {
    throw new Error(`The server returned an invalid ${label} list. Please refresh.`)
  }
  return value
}

function requireNumbers(value, fields) {
  return value && fields.every((key) => Number.isFinite(value[key]) && value[key] >= 0)
}

export function validateCompanyDashboard(data, type) {
  const store = type === 'store'
  const fields = store ? ['sales', 'earnings', 'orders', 'completedOrders', 'unitsSold', 'averageOrder', 'reviews', 'averageRating']
    : ['income', 'deliveries', 'averageFee', 'distanceKm']
  if (data?.success !== true || !COMPANY_PERIODS.every(([key]) => requireNumbers(data.periods?.[key], fields)) ||
      (store && (!requireNumbers(data.products, ['total', 'approved', 'pending', 'readyFulfillments']) ||
        !requireNumbers(data.inventory, ['unitsInStock', 'value', 'lowStock', 'outOfStock']) ||
        !requireNumbers(data.payouts, ['paidOut', 'pending', 'available']) || !requireNumbers(data.orders, ['pending'])))) {
    throw new Error(`The server returned incomplete ${type} analytics. Please refresh.`)
  }
  if (store) {
    requireList(data.activeOrders, 'active orders')
    requireList(data.recentOrders, 'recent orders')
  } else requireList(data.recentDeliveries, 'recent deliveries')
  return data
}

export function validateDriverRides(data) {
  // Older offline responses omit isAvailable because the server uses false || undefined.
  if (!data?.driver || (data.driver.isAvailable !== undefined && typeof data.driver.isAvailable !== 'boolean') ||
      !data.driver.serviceModes || (data.trip && !Array.isArray(data.trip.stops)) ||
      (data.offer && (!Array.isArray(data.offer.stops) || !Number.isFinite(Date.parse(data.offer.offerDeadline))))) {
    throw new Error('The server returned invalid driver ride data. Please refresh.')
  }
  requireList(data.payments, 'ride payments')
  requireList(data.riders, 'riders')
  return data
}

export function assignmentSeconds(order, now = Date.now()) {
  const deadline = Date.parse(order.fulfillmentDeadline)
  return Number.isFinite(deadline) ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0
}

export function inventoryPayload(stock) {
  const result = Object.fromEntries(Object.entries(stock).map(([key, value]) => [key, Number(value)]))
  if (['price', 'countInStock', 'minStock'].some((key) =>
    String(stock[key] ?? '').trim() === '' || !Number.isFinite(result[key]) || result[key] < 0) ||
    !Number.isSafeInteger(result.countInStock) || !Number.isSafeInteger(result.minStock)) {
    throw new Error('Enter a nonnegative price and whole numbers for physical stock and the low-stock threshold.')
  }
  return result
}

export function driverRideFare(ride, amount = ride.finalFare ?? ride.estimate) {
  return Number.isFinite(amount) && ['usd', 'etb'].includes(ride.currency)
    ? `${ride.currency.toUpperCase()} ${amount.toFixed(2)}` : 'Fare unavailable'
}
