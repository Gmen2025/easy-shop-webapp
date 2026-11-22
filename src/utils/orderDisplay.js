export function orderPaymentLabel(order) {
  const labels = {
    '1': 'Cash on delivery',
    '2': 'Bank transfer',
    '3': 'Card payment',
    '4': 'Telebirr',
    cash: 'Cash on delivery',
    cod: 'Cash on delivery',
    cash_on_delivery: 'Cash on delivery',
    bank: 'Bank transfer',
    bank_transfer: 'Bank transfer',
    card: 'Card payment',
    telebirr: 'Telebirr',
  }
  const method = String(order?.paymentMethod ?? '').trim()
  const name = String(order?.methodName ?? '').trim()
  return labels[method.toLowerCase()] || (name && !/^\d+$/.test(name) ? name : '') ||
    (method && !/^\d+$/.test(method) ? method : 'Not specified')
}

export function orderStatusLabel(status) {
  return ({ '1': 'Processing', '2': 'Shipped', '3': 'Delivered' })[status] || status || 'Pending'
}
