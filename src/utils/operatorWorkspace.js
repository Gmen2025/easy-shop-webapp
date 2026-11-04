import { requireList, validateCompanyDashboard, validateDriverRides } from './company.js'

export function businessPath(kind, accountId, view) {
  if (!['store', 'driver'].includes(kind) || !accountId || accountId === 'me') throw new Error('Select a store or driver account.')
  const id = encodeURIComponent(accountId)
  if (view === 'profile') return `/finance/accounts/${kind}/${id}/profile`
  if (kind === 'store') {
    if (view === 'reviews') return `/stores/${id}/reviews`
    if (view === 'fulfillment') return `/products/admin/stores/${id}/fulfillment-products`
    if (['dashboard', 'assignments'].includes(view)) return `/stores/admin/${id}/${view}`
  } else {
    if (view === 'rides') return `/rides/admin/drivers/${id}/dashboard`
    if (['dashboard', 'queue', 'completed-today', 'available-deliveries', 'wallet'].includes(view)) return `/drivers/admin/${id}/${view}`
  }
  throw new Error('Unsupported business dashboard.')
}

export function validateBusiness(data, kind, view) {
  if (view === 'dashboard') return validateCompanyDashboard(data, kind)
  if (view === 'rides') return validateDriverRides(data)
  if (view === 'profile') {
    if (!data?.account?._id || !Array.isArray(data.locations) || typeof data.inventoryEnabled !== 'boolean') throw new Error('Invalid account profile response.')
    return data
  }
  if (view === 'wallet') {
    if (!Number.isFinite(data?.walletBalance)) throw new Error('Invalid wallet balance response.')
    requireList(data.transactions, 'wallet transactions')
    return data
  }
  if (view === 'assignments') return requireList(data, 'store assignments')
  const field = { queue: 'queue', 'completed-today': 'orders', 'available-deliveries': 'orders', reviews: 'reviews', fulfillment: 'products' }[view]
  if (!field) throw new Error('Unsupported dashboard response.')
  requireList(data?.[field], view)
  return data
}
