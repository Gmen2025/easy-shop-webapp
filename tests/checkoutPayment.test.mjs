import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cashOnDeliveryAvailable, checkoutPreview, completesProductCart, inspectPendingCheckout, money, nativeCurrency, paymentAmount, paymentMethods, rateIsActive, SHIPMENT_STAGES } from '../src/utils/checkoutPayment.js'
import { calculateDeliveryPricing } from '../src/utils/delivery.js'

const now = Date.UTC(2026, 9, 25, 12)
const enabled = { cash: true, bank: true, card: true, telebirr: true }
const rate = { enabled: true, active: true, birrPerUsd: 150, appliedAt: new Date(now).toISOString(), expiresAt: new Date(now + 86400000).toISOString() }
const deliveries = [
  { key: 'a', store: { name: 'Store A' }, distanceKm: 2, pricingGroup: { key: 'shared' }, vehicle: 'car', vehicleOptions: [{ type: 'car', fee: 5 }, { type: 'van', fee: 12 }] },
  { key: 'b', store: { name: 'Store B' }, distanceKm: 3, pricingGroup: { key: 'shared' }, vehicle: 'car', vehicleOptions: [{ type: 'car', fee: 7 }, { type: 'van', fee: 15 }] },
]

test('pending checkout verification blocks only reservations and bank review, never a quote or terminal checkout', async () => {
  assert.equal(await inspectPendingCheckout(null, () => assert.fail('No checkout to load')), null)
  for (const status of ['quote', 'awaiting_payment', 'bank_review', 'placed', 'cancelled']) {
    const result = await inspectPendingCheckout('saved', async () => ({ _id: 'saved', status }))
    assert.equal(result.blocksNewQuote, ['awaiting_payment', 'bank_review'].includes(status))
    assert.equal(result.checkout.status, status)
  }
  for (const status of ['awaiting_payment', 'bank_review']) {
    const result = await inspectPendingCheckout('expired', async () => ({
      _id: 'expired', status, expiresAt: '2000-01-01T00:00:00.000Z',
    }))
    assert.equal(result.blocksNewQuote, true, 'Expiry alone cannot prove that payment was cancelled')
  }
  assert.equal(await inspectPendingCheckout('missing', async () => {
    throw Object.assign(new Error('Checkout not found'), { status: 404 })
  }), null)
  for (const status of [401, 403, 500, undefined]) {
    const failure = Object.assign(new Error('Unable to verify'), { status })
    await assert.rejects(inspectPendingCheckout('saved', async () => { throw failure }), failure)
  }
  for (const invalid of [null, { _id: 'different', status: 'quote' }, { _id: 'saved', status: 'unknown' }]) {
    await assert.rejects(inspectPendingCheckout('saved', async () => invalid), /Unable to verify/)
  }
})

test('daily rates are active strictly before 24 hours, never in the future or when disabled', () => {
  assert.equal(rateIsActive(rate, now), true)
  assert.equal(rateIsActive(rate, now + 86400000 - 1), true)
  assert.equal(rateIsActive(rate, now + 86400000), false)
  assert.equal(rateIsActive(rate, now - 1), false)
  for (const overrides of [{ enabled: false }, { active: false }, { birrPerUsd: 0 }, { birrPerUsd: '150' }, { expiresAt: 'invalid' }]) {
    assert.equal(rateIsActive({ ...rate, ...overrides }, now), false)
  }
  assert.equal(rateIsActive({ ...rate, expiresAt: new Date(now + 172800000).toISOString() }, now + 86400000), false)
})

test('Ethiopia USD quotes divide ETB totals and vehicle upgrades update payment previews', () => {
  const group = { itemsSubtotal: 1500, deliveries, exchangeRate: rate, currency: 'usd' }
  assert.deepEqual(checkoutPreview(group, {}, calculateDeliveryPricing), { total: 1505, payment: 10.03 })
  assert.deepEqual(checkoutPreview(group, { b: 'van' }, calculateDeliveryPricing), { total: 1520, payment: 10.13 })
  assert.equal(nativeCurrency('E_Shopping'), 'etb')
})

test('international previews include shipping once per recipient and multiply USD by the saved rate', () => {
  const group = { itemsSubtotal: 100, deliveries, international: { shippingFee: 25 },
    exchangeRate: { ...rate, direction: 'usd-to-etb' }, currency: 'etb' }
  assert.deepEqual(checkoutPreview(group, {}, calculateDeliveryPricing), { total: 130, payment: 19500 })
  assert.deepEqual(checkoutPreview(group, { b: 'van' }, calculateDeliveryPricing), { total: 145, payment: 21750 })
  assert.equal(nativeCurrency('E_ShopUSA'), 'usd')
})

test('service USD quotes have no cart or delivery costs and use the Admin total', () => {
  const group = { kind: 'service', itemsSubtotal: 1234.5, deliveries: [], exchangeRate: rate }
  assert.deepEqual(checkoutPreview(group, {}, calculateDeliveryPricing), { total: 1234.5, payment: 8.23 })
})

test('prepared payment recovery uses saved amounts regardless of rate expiry or new rates', () => {
  const group = { status: 'awaiting_payment', totalPrice: 1500, paymentAmount: 10, currency: 'usd',
    exchangeRate: { ...rate, expiresAt: '2000-01-01T00:00:00Z', birrPerUsd: 999 } }
  assert.equal(paymentAmount(group), 10)
  assert.equal(money(paymentAmount(group), 'usd'), '$10.00')
  assert.equal(paymentAmount({ totalPrice: 50 }), 50)
  assert.throws(() => paymentAmount({ ...group, paymentAmount: undefined }), /missing/)
  assert.throws(() => money(NaN, 'usd'), /unavailable/)
})

test('methods enforce ETB export bank-only and dedicated USD card policy without cash bypasses', () => {
  assert.deepEqual(paymentMethods({ international: {} }, 'E_ShopUSA', { cardAvailable: true }, enabled), ['bank'])
  assert.deepEqual(paymentMethods({ exchangeRate: rate }, 'E_Shopping', { cardAvailable: false }, enabled), ['bank'])
  assert.deepEqual(paymentMethods({ kind: 'service', exchangeRate: rate }, 'E_Shopping', { cardAvailable: true }, enabled), ['bank', 'card'])
  assert.deepEqual(paymentMethods({}, 'E_Shopping', null, enabled), ['bank', 'cash'])
  assert.deepEqual(paymentMethods({}, 'E_ShopUSA', null, enabled), ['bank', 'card', 'cash'])
})

test('USA native cash is available in all builds but never offered for converted, international or service payments', () => {
  assert.equal(cashOnDeliveryAvailable('E_ShopUSA'), true)
  assert.equal(cashOnDeliveryAvailable('E_ShopUSA', false), true)
  assert.equal(cashOnDeliveryAvailable('E_ShopUSA', true), true)
  assert.equal(cashOnDeliveryAvailable('E_ShopUSA', 'true'), true)
  assert.equal(cashOnDeliveryAvailable('E_Shopping', false), true)
  assert.deepEqual(paymentMethods({}, 'E_ShopUSA', null, enabled), ['bank', 'card', 'cash'])
  assert.deepEqual(paymentMethods({}, 'E_ShopUSA', null, { ...enabled, cash: false }), ['bank', 'card'])
  for (const group of [{ international: {} }, { exchangeRate: rate }, { kind: 'service' }]) {
    assert.equal(paymentMethods(group, 'E_ShopUSA', { cardAvailable: true }, enabled).includes('cash'), false)
  }
})

test('international bank review completes the purchased cart but never clears cart for service payments', () => {
  assert.equal(completesProductCart({ status: 'bank_review', international: {} }), true)
  assert.equal(completesProductCart({ status: 'awaiting_payment', international: {} }), false)
  assert.equal(completesProductCart({ status: 'bank_review' }), false)
  assert.equal(completesProductCart({ status: 'placed', kind: 'service' }), false)
  assert.equal(completesProductCart({ status: 'placed', kind: 'products' }), true)
  assert.deepEqual(SHIPMENT_STAGES, ['awaiting_hub', 'at_hub', 'shipped', 'arrived_ethiopia', 'delivered'])
})

test('group and child receipts distinguish ETB payment from USD costs and final delivery from the hub', async () => {
  const { createServer } = await import('vite')
  const cacheDir = await mkdtemp(join(tmpdir(), 'checkout-payment-test-'))
  const server = await createServer({
    configFile: false, cacheDir, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom',
    plugins: [(await import('@vitejs/plugin-react')).default()],
    define: { 'import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY': JSON.stringify('pk_test_native_must_not_be_used') },
    optimizeDeps: { noDiscovery: true, include: [] },
  })
  try {
    const { createElement } = await import('react')
    const { renderToStaticMarkup } = await import('react-dom/server')
    const { ExchangeReceipt, InternationalReceipt } = await server.ssrLoadModule('/src/components/CheckoutReceipts.jsx')
    const exchange = renderToStaticMarkup(createElement(ExchangeReceipt, { value: {
      paymentCurrency: 'etb', paymentAmount: 19500, totalPrice: 130, exchangeRate: { ...rate, direction: 'usd-to-etb' },
    } }))
    assert.match(exchange, /ETB/)
    assert.match(exchange, /19,500/)
    assert.match(exchange, /US catalog and shipping costs remain USD/)
    const receipt = renderToStaticMarkup(createElement(InternationalReceipt, { group: {
      status: 'bank_review', international: { shippingFee: 25, hub: { address1: 'US Hub' },
        customsNotice: 'Duties excluded', shipments: [{ id: 'home', status: 'awaiting_hub',
          shippingUsd: 25, billableKg: 2, recipient: { label: 'Home', address1: 'Ethiopia Road' } }] },
    } }))
    assert.match(receipt, /not final delivery in Ethiopia/)
    assert.match(receipt, /Do not pay again/)
    assert.match(receipt, /Stock remains reserved/)
    assert.match(receipt, /Ethiopia Road/)
    assert.match(receipt, /Duties excluded/)
    const { default: DeliveryCardPayment } = await server.ssrLoadModule('/src/components/DeliveryCardPayment.jsx')
    const missingMerchant = renderToStaticMarkup(createElement(DeliveryCardPayment, {
      dedicatedMerchant: true, clientSecret: 'fixture', id: 'fixture', onConfirm() {},
    }))
    assert.match(missingMerchant, /dedicated Ethiopia USD merchant key saved by the server/)
    assert.match(missingMerchant, /native merchant key cannot be substituted/)
  } finally {
    await server.close()
    await rm(cacheDir, { recursive: true, force: true })
  }
})
