import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildQuotePayload, calculateDeliveryPricing, selectDeliveryVehicle, cartMatchesQuote, directionsUrl, latLng, validateAddress } from '../src/utils/delivery.js'

const address = { id: 'home', label: 'Home', address1: 'Bole Road', address2: '', city: 'Addis Ababa', zip: '', country: 'Ethiopia', phone: '+251900000000' }
const items = [{ product: { id: 'product', price: 25, storefrontId: 'store', cartKey: 'store:product' }, quantity: 3 }]

test('quote allocations preserve storefront constraints and every unit exactly once', () => {
  const payload = buildQuotePayload(items, [address, { ...address, id: 'work' }],
    { 'store:product': { home: '1', work: '2' } }, 'STANDARD')
  assert.deepEqual(payload.cart, [{ key: 'store:product', product: 'product', price: 25, quantity: 3, storefrontId: 'store' }])
  assert.deepEqual(payload.allocations, [
    { key: 'store:product', addressId: 'home', quantity: 1 },
    { key: 'store:product', addressId: 'work', quantity: 2 },
  ])
  assert.equal(payload.scheduledFor, null)
  assert.throws(() => buildQuotePayload(items, [address], { 'store:product': { home: 2 } }, 'STANDARD'), /exactly once/)
  for (const invalid of [-1, 1.5, 'abc', Infinity]) {
    assert.throws(() => buildQuotePayload(items, [address], { 'store:product': { home: invalid } }, 'STANDARD'), /whole quantities/)
  }
})

test('only used addresses are validated and Ethiopia does not require ZIP', () => {
  assert.doesNotThrow(() => validateAddress(address))
  assert.throws(() => validateAddress({ ...address, country: 'United States' }), /Postal code/)
  const payload = buildQuotePayload(items, [address, { id: 'unused' }], { 'store:product': { home: 3 } }, 'STANDARD')
  assert.equal(payload.addresses.length, 1)
  assert.throws(() => validateAddress({ ...address, phone: '' }), /phone/)
})

test('schedules require a future time and quote matching detects changed carts', () => {
  assert.throws(() => buildQuotePayload(items, [address], { 'store:product': { home: 3 } }, 'SCHEDULED', '2000-01-01'), /future/)
  const payload = buildQuotePayload(items, [address], { 'store:product': { home: 3 } }, 'SCHEDULED', new Date(Date.now() + 86400000).toISOString())
  assert.ok(payload.scheduledFor)
  assert.equal(cartMatchesQuote(items, payload), true)
  assert.equal(cartMatchesQuote([{ ...items[0], quantity: 2 }], payload), false)
  assert.equal(cartMatchesQuote([{ ...items[0], product: { ...items[0].product, price: 30 } }], payload), false)
})

const delivery = (key, distanceKm, fee, pricingGroup = 'nearby') => ({
  key, distanceKm, store: { name: key }, pricingGroup: { key: pricingGroup }, vehicle: 'car',
  vehicleOptions: [{ type: 'car', fee }, { type: 'van', fee: fee * 2 }], deliveryFee: fee,
})

test('nearby stores share nearest-road-route fee with exact cent apportionment', () => {
  const deliveries = [delivery('c', 4, 20), delivery('a', 2, 10), delivery('b', 3, 15)]
  const result = calculateDeliveryPricing(deliveries)
  assert.equal(result.deliveryFee, 10)
  assert.equal(result.byKey.a.deliveryFee, 3.34)
  assert.equal(result.byKey.b.deliveryFee, 3.33)
  assert.equal(result.byKey.c.deliveryFee, 3.33)
  assert.equal(Math.round(Object.values(result.byKey).reduce((sum, line) => sum + line.deliveryFee, 0) * 100), 1000)
  assert.equal(calculateDeliveryPricing([...deliveries].reverse()).deliveryFee, 10)
})

test('separate vehicles, destinations and distant stores are not undercharged', () => {
  const deliveries = [delivery('a', 2, 10), delivery('b', 3, 15), delivery('c', 1, 7, 'another-address')]
  assert.equal(calculateDeliveryPricing(deliveries, { b: 'van' }).deliveryFee, 47)
  assert.throws(() => calculateDeliveryPricing(deliveries, { b: 'truck' }), /offered vehicle/)
  const unknownCargo = { ...delivery('a', 2, 10), vehicle: '', requiresVehicleSelection: true }
  assert.equal(calculateDeliveryPricing([unknownCargo]).deliveryFee, 10)
})

test('cart routes charge once across stores and addresses, conserve cents, and require one vehicle', () => {
  const deliveries = ['a', 'b', 'c'].map((key) => ({
    ...delivery(key, 10, 10.01, 'cart-route-v1'), pricingGroup: { key: 'cart-route-v1', kind: 'cart-route' },
  }))
  const result = calculateDeliveryPricing(deliveries)
  assert.equal(result.deliveryFee, 10.01)
  assert.deepEqual(Object.values(result.byKey).map((line) => line.deliveryFee), [3.34, 3.34, 3.33])
  assert.equal(calculateDeliveryPricing(deliveries, { a: 'van', b: 'van', c: 'van' }).deliveryFee, 20.02)
  assert.throws(() => calculateDeliveryPricing(deliveries, { a: 'van' }), /one vehicle for the entire cart/)
})

test('store routes charge separately even for nearby stores; vehicle changes update only the same store destinations', () => {
  const deliveries = ['a', 'b', 'c'].map((key, index) => ({
    ...delivery(key, 5, 10.01),
    store: { _id: index < 2 ? 'store1' : 'store2', name: 'Store' },
    pricingGroup: { kind: 'store-route', key: index < 2 ? 'store-route:1' : 'store-route:2' },
  }))
  const result = calculateDeliveryPricing(deliveries)
  assert.equal(result.deliveryFee, 20.02)
  assert.deepEqual(Object.values(result.byKey).map((entry) => entry.deliveryFee), [5.01, 5, 10.01])
  assert.ok(Object.values(result.byKey).every((entry) => entry.storeCount === 1))
  const selected = selectDeliveryVehicle(deliveries, {}, deliveries[0], 'van')
  assert.deepEqual(selected, { a: 'van', b: 'van' })
  assert.equal(calculateDeliveryPricing(deliveries, selected).deliveryFee, 30.03)
  assert.throws(() => calculateDeliveryPricing(deliveries, { a: 'van' }), /one vehicle/)
})

test('map coordinates are validated and directions use driving mode', () => {
  assert.deepEqual(latLng({ type: 'Point', coordinates: [38.75, 9.01] }), { lat: 9.01, lng: 38.75 })
  assert.equal(latLng({ latitude: 91, longitude: 38 }), null)
  assert.equal(latLng({ latitude: null, longitude: null }), null)
  const url = new URL(directionsUrl({ coordinates: [38.75, 9.01] }, { latitude: 9, longitude: 38 }))
  assert.equal(url.searchParams.get('travelmode'), 'driving')
  assert.equal(url.searchParams.get('destination'), '9.01,38.75')
  assert.equal(directionsUrl({}), null)
  assert.equal(directionsUrl({ coordinates: [-87.65, 41.94] }, null, { requireOrigin: true }), null)
  const pickupLeg = new URL(directionsUrl({ coordinates: [-87.65, 41.94] },
    { latitude: 42.03, longitude: -87.98 }, { requireOrigin: true }))
  assert.equal(pickupLeg.searchParams.get('origin'), '42.03,-87.98')
  assert.equal(pickupLeg.searchParams.get('destination'), '41.94,-87.65')
})

test('cart preserves store identity and removes purchased units only once across reloads', async () => {
  const { createServer } = await import('vite')
  const storage = new Map()
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  } })
  const cacheDir = await mkdtemp(join(tmpdir(), 'delivery-cart-test-'))
  const server = await createServer({
    configFile: false, cacheDir, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom',
    plugins: [(await import('@vitejs/plugin-react')).default()],
    optimizeDeps: { noDiscovery: true, include: [] },
  })
  try {
    const { default: reducer, addToCart, completeDeliveryCheckout, switchDatabase } = await server.ssrLoadModule('/src/features/cart/cartSlice.js')
    const product = { id: 'p', name: 'Parcel', price: 10, countInStock: 20, images: ['', 'https://example.test/parcel.jpg'] }
    let state = reducer(undefined, addToCart({ product, quantity: 3 }))
    state = reducer(state, addToCart({ product: { ...product, storefrontId: 'store-a', storefrontName: 'Market A' }, quantity: 2 }))
    state = reducer(state, addToCart({ product: { ...product, storefrontId: 'store-b' }, quantity: 1 }))
    assert.deepEqual(state.items.map((item) => item.product.cartKey), ['p', 'store-a:p', 'store-b:p'])
    assert.equal(state.items[0].product.image, 'https://example.test/parcel.jpg')
    assert.equal(state.items[1].product.storefrontName, 'Market A')
    const { createElement } = await import('react')
    const { renderToStaticMarkup } = await import('react-dom/server')
    const { Provider } = await import('react-redux')
    const { MemoryRouter } = await import('react-router-dom')
    const { configureStore } = await import('@reduxjs/toolkit')
    const { default: CartContents } = await server.ssrLoadModule('/src/components/CartContents.jsx')
    const store = configureStore({ reducer: { cart: reducer, auth: () => ({ user: { id: 'customer' } }) }, preloadedState: { cart: state } })
    const markup = renderToStaticMarkup(createElement(Provider, { store },
      createElement(MemoryRouter, null, createElement(CartContents))))
    assert.match(markup, /src="https:\/\/example.test\/parcel.jpg"/)
    assert.match(markup, /Market A/)
    assert.match(markup, /Main catalog/)
    assert.match(markup, /Products subtotal/)
    assert.match(markup, /60\.00/)
    assert.match(markup, /Increase Parcel quantity/)
    assert.match(markup, /Proceed to Checkout/)
    assert.match(markup, /class="mobile-cart-checkout-bar" role="region" aria-label="Continue from cart"/)
    const { default: ProfilePage } = await server.ssrLoadModule('/src/pages/ProfilePage.jsx')
    const profileStore = configureStore({ reducer: {
      auth: () => ({ user: { id: 'customer', name: 'Test Customer', email: 'customer@example.test', shippingAddress1: '810 Grace St' } }),
    } })
    const profile = renderToStaticMarkup(createElement(Provider, { store: profileStore },
      createElement(MemoryRouter, null, createElement(ProfilePage))))
    for (const text of ['Test Customer', 'customer@example.test', '810 Grace St', 'Order List',
      'Track Delivery', 'Cancellation', 'Payment', 'Privacy &amp; Account', 'Help &amp; Support',
      'Sign Out', 'Customer details', 'easyshop@addugeneteshop.com']) assert.ok(profile.includes(text), text)
    for (const destination of ['/edit-profile', '/orders', '/delivery-checkouts', '/service-requests',
      '/privacy-policy', '/terms.html', '/service-request']) assert.ok(profile.includes(`href="${destination}"`), destination)
    const { default: CheckoutHeader } = await server.ssrLoadModule('/src/components/CheckoutHeader.jsx')
    const header = renderToStaticMarkup(createElement(CheckoutHeader, { step: 4, title: 'Order Summary' }))
    assert.match(header, /Order Summary/)
    assert.match(header, /aria-current="step"><span>4<\/span>Payment/)
    const { default: DeliveryMap } = await server.ssrLoadModule('/src/components/DeliveryMap.jsx')
    const directions = renderToStaticMarkup(createElement(DeliveryMap, {
      pickup: { coordinates: [-87.65, 41.95] }, dropoff: { coordinates: [-87.64, 41.94] },
    }))
    assert.match(directions, /class="ghost-button delivery-map-directions"/)
    assert.match(directions, /Open driving directions in Google Maps \(new tab\)/)
    assert.match(directions, /target="_blank"/)
    assert.match(directions, /origin=41.95%2C-87.65/)
    const { default: AddressAutocomplete } = await server.ssrLoadModule('/src/components/AddressAutocomplete.jsx')
    const addressInput = renderToStaticMarkup(createElement(AddressAutocomplete, {
      label: 'Pickup address', value: '810 Grace St', country: 'USA',
      onChange: () => {}, onSelect: () => {}, required: true,
    }))
    assert.match(addressInput, /role="combobox"/)
    assert.match(addressInput, /aria-expanded="false"/)
    assert.match(addressInput, /value="810 Grace St"/)
    assert.match(addressInput, /Pickup address/)
    assert.match(addressInput, /required=""/)
    for (const placeholder of ['Search pickup location', 'Search drop-off location']) {
      const emptyInput = renderToStaticMarkup(createElement(AddressAutocomplete, {
        label: 'Street address', value: '', country: 'USA', placeholder,
        onChange: () => {}, onSelect: () => {},
      }))
      assert.ok(emptyInput.includes(`placeholder="${placeholder}"`))
      assert.match(emptyInput, /value=""/)
      assert.match(emptyInput, /<label[^>]*>Street address<\/label>/)
    }
    const reloaded = reducer(state, switchDatabase())
    assert.equal(reloaded.items[0].product.image, 'https://example.test/parcel.jpg')
    assert.equal(reloaded.items[1].product.storefrontName, 'Market A')
    const completion = { id: 'checkout-1', cart: [{ key: 'p', quantity: 2 }, { key: 'store-a:p', quantity: 2 }] }
    state = reducer(state, completeDeliveryCheckout(completion))
    assert.deepEqual(state.items.map((item) => [item.product.cartKey, item.quantity]), [['p', 1], ['store-b:p', 1]])
    state = reducer(state, switchDatabase())
    state = reducer(state, completeDeliveryCheckout(completion))
    assert.equal(state.items[0].quantity, 1)
    storage.set('selectedDatabaseName', 'E_ShopUSA')
    state = reducer(state, switchDatabase())
    assert.deepEqual(state.items, [])
    assert.deepEqual(state.completedDeliveryCheckouts, [])
  } finally {
    await server.close()
    await rm(cacheDir, { recursive: true, force: true })
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor)
    else delete globalThis.localStorage
  }
})
