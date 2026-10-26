export const ADMIN_PERIODS = [
  ['daily', '24 Hours'], ['weekly', '7 Days'], ['monthly', '30 Days'],
  ['quarterly', '90 Days'], ['yearly', '365 Days'],
]
export const ADMIN_TOOLS = [
  ['Products', 'Catalog, images and stock', '/admin/tools/products', 'catalog'],
  ['Categories', 'Organize your catalog', '/admin/tools/categories', 'catalog'],
  ['Orders', 'Statuses and customer details', '/admin/tools/orders', 'sales'],
  ['Inventory', 'Low-stock alerts and restocking', '/admin/tools/inventory', 'catalog'],
  ['Delivery', 'Origin, rates and delivery windows', '/admin/tools/delivery', 'fulfillment'],
  ['Vehicles', 'Capacity, route fees and packaged cargo', '/admin/delivery', 'fulfillment'],
  ['Rides', 'Ride service settings and operations', '/admin/rides', 'fulfillment'],
  ['FX Rate', 'Daily exchange rates and automation', '/admin/international-payments', 'sales'],
  ['US Shipping', 'Export hub, tariffs and eligible products', '/admin/international-payments#shipping', 'fulfillment'],
  ['Payments', 'Verify transfers, cancellations and refunds', '/admin/delivery-payments', 'sales'],
  ['Bank Accounts', 'Regional payment account configuration', '/admin/tools/banks', 'sales'],
  ['Payouts', 'Store settlements and paid records', '/admin/operations/payouts', 'sales'],
  ['Drivers', 'Applications and company driver management', '/admin/operations/drivers', 'people'],
  ['Store Owners', 'Review owner applications', '/admin/operations/store-owners', 'people'],
  ['Stores', 'Store details and approvals', '/admin/operations/stores', 'people'],
  ['Assign Roles', 'Manage user roles and access', '/admin/operations/roles', 'people'],
  ['Service Requests', 'Assign, quote and manage services', '/admin/tools/services', 'sales'],
  ['Notifications', 'Broadcast messages to customers', '/admin/operations/broadcast', 'settings'],
  ['Maintenance', 'Control shopper availability', '/admin/tools/maintenance', 'settings'],
  ['Payment Methods', 'Enable payments by region', '/admin/tools/payment-methods', 'settings'],
  ['Social Sign-in', 'Google, Apple and Facebook switches', '/admin/tools/social', 'settings'],
]

const periodFields = ['totalSales', 'productSales', 'deliveryIncome', 'orders', 'completedOrders',
  'cancelledOrders', 'paidOrders', 'pendingPaymentOrders', 'unitsSold', 'deliveryDistanceKm', 'averageOrder', 'averageDeliveryFee']

export function validateDashboard(data) {
  const numeric = (record, fields) => record && fields.every((field) => Number.isFinite(record[field]))
  if (data?.success !== true || ADMIN_PERIODS.some(([key]) =>
    !numeric(data.periods?.[key], periodFields) || !data.periods[key].paymentMethods ||
    typeof data.periods[key].paymentMethods !== 'object' || Array.isArray(data.periods[key].paymentMethods) ||
    Object.values(data.periods[key].paymentMethods).some((value) => !Number.isFinite(value))) ||
    !numeric(data.operations, ['outstandingOrders', 'activeDeliveries']) ||
    !numeric(data.inventory, ['products', 'unitsInStock', 'lowStock', 'outOfStock', 'value']) ||
    !numeric(data.payouts, ['paid', 'pending']) ||
    !numeric(data.lifetime, ['totalSales', 'completedOrders']) ||
    !Array.isArray(data.recentSales) || data.recentSales.some((sale) =>
      !sale?._id || !numeric(sale, ['totalSales', 'productSales', 'deliveryIncome']) ||
      !Number.isFinite(new Date(sale.completedAt).getTime()))) {
    throw new Error('The server returned incomplete sales analytics. Refresh or check the shared backend.')
  }
  return data
}
