export const PAYMENT_LABELS = { cash: 'Cash on delivery / cash to driver', bank: 'Bank transfer', card: 'Card', telebirr: 'Telebirr' }
export const PAYMENT_UNAVAILABLE = 'Payment is temporarily unavailable. Please try again later.'

export function parsePaymentSettings(data) {
  if (data?.success !== true || Object.keys(PAYMENT_LABELS).some((key) => typeof data.methods?.[key] !== 'boolean')) {
    throw new Error('Unable to load payment availability. Please try again.')
  }
  return data.methods
}

export function enabledPaymentMethods(candidates, settings) {
  return candidates.filter((key) => settings?.[key] === true)
}
