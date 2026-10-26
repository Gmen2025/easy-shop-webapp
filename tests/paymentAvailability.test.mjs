import test from 'node:test'
import assert from 'node:assert/strict'
import { enabledPaymentMethods, parsePaymentSettings, PAYMENT_UNAVAILABLE } from '../src/utils/paymentAvailability.js'
import { paymentMethods } from '../src/utils/checkoutPayment.js'

const all = { cash: true, bank: true, card: true, telebirr: true }

test('regional settings require the complete explicit boolean API shape and fail closed', () => {
  assert.deepEqual(parsePaymentSettings({ success: true, methods: all }), all)
  for (const data of [null, {}, { success: false, methods: all }, { success: true, methods: {} },
    ...Object.keys(all).map((key) => ({ success: true, methods: { ...all, [key]: 'true' } }))]) {
    assert.throws(() => parsePaymentSettings(data), /Unable to load payment availability/)
  }
  assert.deepEqual(enabledPaymentMethods(['cash', 'bank'], null), [])
  assert.deepEqual(enabledPaymentMethods(['cash', 'bank'], { cash: 'true', bank: true }), ['bank'])
})

test('every method can be disabled independently; USA and Ethio checkout show no eligible methods when all are off', () => {
  for (const database of ['E_Shopping', 'E_ShopUSA']) {
    const baseline = paymentMethods({}, database, null, all)
    for (const key of baseline) {
      assert.deepEqual(paymentMethods({}, database, null, { ...all, [key]: false }), baseline.filter((method) => method !== key))
    }
    for (const settings of [null, {}, { cash: false, bank: false, card: false, telebirr: false }]) {
      assert.deepEqual(paymentMethods({}, database, null, settings), [])
    }
  }
  assert.equal(PAYMENT_UNAVAILABLE, 'Payment is temporarily unavailable. Please try again later.')
  assert.deepEqual(paymentMethods({ international: {} }, 'E_ShopUSA', null, { ...all, bank: false }), [],
    'Unsupported methods must not be offered as an export fallback')
})
