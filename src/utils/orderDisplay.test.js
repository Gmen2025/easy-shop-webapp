import test from 'node:test'
import assert from 'node:assert/strict'
import { orderPaymentLabel, orderStatusLabel } from './orderDisplay.js'

test('labels legacy numeric and current payment methods without guessing unknown codes', () => {
  assert.equal(orderPaymentLabel({ paymentMethod: 1 }), 'Cash on delivery')
  assert.equal(orderPaymentLabel({ paymentMethod: '2' }), 'Bank transfer')
  assert.equal(orderPaymentLabel({ paymentMethod: '3' }), 'Card payment')
  assert.equal(orderPaymentLabel({ paymentMethod: 4 }), 'Telebirr')
  assert.equal(orderPaymentLabel({ paymentMethod: 'bank' }), 'Bank transfer')
  assert.equal(orderPaymentLabel({ paymentMethod: 'bank_transfer' }), 'Bank transfer')
  assert.equal(orderPaymentLabel({ paymentMethod: '9', methodName: 'Mobile money' }), 'Mobile money')
  assert.equal(orderPaymentLabel({ paymentMethod: '9' }), 'Not specified')
  assert.equal(orderPaymentLabel({}), 'Not specified')
})

test('labels legacy and current order statuses', () => {
  assert.equal(orderStatusLabel('3'), 'Delivered')
  assert.equal(orderStatusLabel('Shipped'), 'Shipped')
})
