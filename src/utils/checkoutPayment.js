export const SHIPMENT_STAGES = ['awaiting_hub', 'at_hub', 'shipped', 'arrived_ethiopia', 'delivered']

export function rateIsActive(state, now = Date.now()) {
  const applied = new Date(state?.appliedAt).getTime()
  const expiry = new Date(state?.expiresAt).getTime()
  return Boolean(state?.active && state?.enabled && Number.isFinite(state.birrPerUsd) &&
    state.birrPerUsd > 0 && applied <= now && expiry > now && now - applied < 86400000)
}

export function money(amount, currency) {
  if (!Number.isFinite(amount)) throw new Error('The checkout amount is unavailable. Refresh the saved checkout before paying.')
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(amount)
}

export function paymentAmount(value) {
  const amount = value.exchangeRate ? value.paymentAmount : value.totalPrice
  if (!Number.isFinite(amount)) throw new Error('The saved payment amount is missing. Contact support before paying.')
  return amount
}

export function nativeCurrency(database) {
  return /usa/i.test(database) ? 'usd' : 'etb'
}

export function cashOnDeliveryAvailable(database) {
  return Boolean(database)
}

export function paymentMethods(group, database, exchange, settings) {
  const supported = group.international ? ['bank'] :
    group.exchangeRate || group.kind === 'service' ? exchange?.cardAvailable ? ['bank', 'card'] : ['bank'] : [
    'bank', ...(/usa/i.test(database) ? ['card'] : []),
    ...(cashOnDeliveryAvailable(database) ? ['cash'] : []),
  ]
  return supported.filter((key) => settings?.[key] === true)
}

export function checkoutPreview(group, selections, calculatePricing) {
  const deliveryFee = calculatePricing(group.deliveries, selections).deliveryFee
  const total = Math.round((group.itemsSubtotal + deliveryFee + (group.international?.shippingFee || 0)) * 100) / 100
  if (!group.exchangeRate) return { total, payment: total }
  const rate = group.exchangeRate.birrPerUsd
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('The saved exchange rate is invalid. Request a fresh quote.')
  return { total, payment: Math.round((group.exchangeRate.direction === 'usd-to-etb' ? total * rate : total / rate) * 100) / 100 }
}

export function completesProductCart(group) {
  return group.kind !== 'service' && (group.status === 'placed' || Boolean(group.international && group.status === 'bank_review'))
}

export async function inspectPendingCheckout(id, loadCheckout) {
  if (!id) return null
  let checkout
  try {
    checkout = await loadCheckout(id)
  } catch (error) {
    if (error.status === 404) return null
    throw error
  }
  if (!checkout || checkout._id !== id ||
      !['quote', 'awaiting_payment', 'bank_review', 'placed', 'cancelled'].includes(checkout.status)) {
    throw new Error('Unable to verify your previous checkout. Refresh its status before starting another.')
  }
  return {
    checkout,
    blocksNewQuote: checkout.status === 'awaiting_payment' || checkout.status === 'bank_review',
  }
}
