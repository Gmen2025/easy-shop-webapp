import test from 'node:test'
import assert from 'node:assert/strict'
import { rm } from 'node:fs/promises'
import {
  catalogNotificationWarnings, catalogSettings, customerCoordinates, entityId, nearestStoreProduct,
  ownedByStore, ownerProductPayload, selectCatalogProducts, unresolvedCartItems, unscopedProductQuote,
} from '../src/utils/catalogPricing.js'
import { buildQuotePayload } from '../src/utils/delivery.js'

test('settings require an explicit boolean and never silently default to OFF', () => {
  for (const payload of [null, {}, { nearestStorePricingEnabled: 'false' }]) {
    assert.throws(() => catalogSettings(payload), /unavailable/)
  }
  assert.equal(catalogSettings({ nearestStorePricingEnabled: false }).nearestStorePricingEnabled, false)
  assert.equal(catalogSettings({ nearestStorePricingEnabled: true }).nearestStorePricingEnabled, true)
})

test('customer locations accept supported saved geometry or explicit coordinates, never blank defaults', () => {
  assert.deepEqual(customerCoordinates({ location: { coordinates: [38.7, 9.1] } }), { latitude: 9.1, longitude: 38.7 })
  assert.deepEqual(customerCoordinates({ latitude: '0', longitude: '0' }), { latitude: 0, longitude: 0 })
  for (const location of [{}, { latitude: '', longitude: '' }, { latitude: ' ', longitude: ' ' }, { latitude: true, longitude: false }, { latitude: null, longitude: 0 },
    { latitude: 91, longitude: 0 }, { latitude: 0, longitude: -181 }, { latitude: NaN, longitude: 0 }]) {
    assert.equal(customerCoordinates(location), null)
  }
})

test('ownership compares normalized provenance IDs; shared products/categories never match by user or name', () => {
  assert.equal(entityId({ _id: { $oid: 'store' } }), 'store')
  assert.equal(ownedByStore({ createdByStore: { _id: 'store' } }, { _id: { $oid: 'store' } }), true)
  assert.equal(ownedByStore({ createdByStore: 'other' }, { _id: 'store' }), false)
  assert.equal(ownedByStore({ name: 'store' }, { _id: 'store' }), false)
  assert.equal(ownedByStore({}, {}), false)
})

test('owner publishing preserves text and multiple images while validating only numeric inventory fields', () => {
  const form = {
    name: ' Product ', description: ' Description ', brand: ' Brand ', richDescription: 'Detailed text',
    category: 'category', price: '12.5', countInStock: '3', minStock: '1',
    images: ['https://example.test/one.png', 'https://example.test/two.png', 'https://example.test/one.png'],
  }
  const payload = ownerProductPayload(form)
  assert.equal(payload.name, 'Product')
  assert.equal(payload.description, 'Description')
  assert.equal(payload.category, 'category')
  assert.equal(payload.price, 12.5)
  assert.equal(payload.countInStock, 3)
  assert.equal(payload.minStock, 1)
  assert.equal(payload.image, form.images[0])
  assert.deepEqual(payload.images, form.images.slice(0, 2))
  assert.throws(() => ownerProductPayload({ ...form, images: [] }), /at least one/)
  assert.throws(() => ownerProductPayload({ ...form, countInStock: '1.5' }), /whole numbers/)
})

test('notification warnings and legacy notification.error are surfaced without treating a saved product as failed', () => {
  assert.deepEqual(catalogNotificationWarnings({ notificationWarnings: ['Admin notification failed'], notification: { error: 'Owner notification failed' } }),
    ['Admin notification failed', 'Owner notification failed'])
  assert.deepEqual(catalogNotificationWarnings({ notificationWarnings: ['Duplicate', null], notification: { error: 'Duplicate' } }), ['Duplicate'])
  assert.deepEqual(catalogNotificationWarnings({ _id: 'saved' }), [])
})

test('nearest-store response requires actual resolved inventory and preserves zero price or unavailable stock', () => {
  const payload = {
    product: { _id: 'product', price: 0, countInStock: 0, storefrontId: 'store', inventoryManaged: true },
    store: { _id: 'store', name: 'Actual nearest store' },
    distanceKm: 0,
  }
  assert.deepEqual(nearestStoreProduct(payload, 'product'), { ...payload.product, storefrontName: 'Actual nearest store' })
  for (const change of [{ storefrontId: null }, { storefrontId: 'wrong' }, { price: null }, { price: NaN },
    { price: -1 }, { countInStock: -1 }, { inventoryManaged: false }, { _id: 'stale-product' }]) {
    assert.throws(() => nearestStoreProduct({ ...payload, product: { ...payload.product, ...change } }, 'product'), /valid store pricing/)
  }
  assert.throws(() => nearestStoreProduct({ ...payload, distanceKm: -1 }, 'product'), /valid store pricing/)
})

test('hidden catalog pricing cannot influence price filters, stock filters or price sorting; OFF restores them', () => {
  const products = [
    { _id: 'expensive', name: 'Z product', price: 900, countInStock: 0, category: 'cat' },
    { _id: 'cheap', name: 'A product', price: 10, countInStock: 4, category: { _id: 'cat' } },
  ]
  const filters = { minPrice: '', maxPrice: '50', brand: 'all', minRating: 'all', inStockOnly: true, sortBy: 'priceAsc' }
  const selection = { categoryId: 'cat', searchQuery: '', filters }
  assert.deepEqual(selectCatalogProducts(products, selection, true), products)
  assert.deepEqual(selectCatalogProducts(products, selection, false), [products[1]])
  assert.deepEqual(selectCatalogProducts(products, { ...selection, filters: { ...filters, sortBy: 'nameAsc' } }, true), [...products].reverse())
  assert.deepEqual(selectCatalogProducts(products, { ...selection, searchQuery: 'Z product' }, true), [products[0]])
})

test('old unscoped carts are identified without discarding explicit storefront lines', () => {
  const items = [{ product: { id: 'legacy', price: 1 } }, { product: { id: 'scoped', storefrontId: 'store', price: 2 } }]
  assert.deepEqual(unresolvedCartItems(items), [items[0]])
  assert.equal(unscopedProductQuote({ status: 'quote', cart: [{ product: 'legacy' }] }), true)
  assert.equal(unscopedProductQuote({ status: 'quote', cart: [{ product: 'scoped', storefrontId: 'store' }] }), false)
  assert.equal(unscopedProductQuote({ status: 'placed', cart: [{ product: 'legacy' }] }), false)
  assert.equal(unscopedProductQuote({ status: 'quote', kind: 'service' }), false)
})

test('resolved store identity and price survive delivery quote payload creation', () => {
  const items = [{ product: { id: 'product', cartKey: 'store:product', storefrontId: 'store', price: 42 }, quantity: 1 }]
  const address = { id: 'drop', label: 'Home', address1: 'Street', city: 'Addis', country: 'Ethiopia', phone: '123', latitude: 9, longitude: 38 }
  const payload = buildQuotePayload(items, [address], { 'store:product': { drop: 1 } }, 'STANDARD', '')
  assert.equal(payload.cart[0].storefrontId, 'store')
  assert.equal(payload.cart[0].price, 42)
  assert.equal(payload.cart[0].key, 'store:product')
})

test('website surfaces fail closed, keep explicit storefront prices, and restrict owner edit controls', async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true, value: { getItem: () => null, setItem: () => {} },
  })
  const { createServer } = await import('vite')
  const { createElement: h } = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { Provider } = await import('react-redux')
  const { configureStore } = await import('@reduxjs/toolkit')
  const { MemoryRouter } = await import('react-router-dom')
  const server = await createServer({
    cacheDir: 'node_modules\\.vite-catalog-tests',
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
  })
  try {
    const { CatalogPricingContext } = await server.ssrLoadModule('/src/features/products/useCatalogPricing.js')
    const { default: ProductCard } = await server.ssrLoadModule('/src/components/ProductCard.jsx')
    const { default: CartGuard } = await server.ssrLoadModule('/src/components/CatalogCartGuard.jsx')
    const { default: StoreEditor } = await server.ssrLoadModule('/src/components/StoreCatalogEditor.jsx')
    const { default: Purchase } = await server.ssrLoadModule('/src/components/NearestStorePurchase.jsx')
    const { default: cartReducer, addToCart } = await server.ssrLoadModule('/src/features/cart/cartSlice.js')
    const { default: productsReducer, fetchProductById } = await server.ssrLoadModule('/src/features/products/productsSlice.js')
    const product = { _id: 'product', name: 'Example product', price: 123.45, countInStock: 3 }
    const render = (element, pricing, items = []) => {
      const state = { auth: { user: { _id: 'owner', isStoreOwner: true } }, cart: { items } }
      const store = configureStore({ reducer: (current = state) => current })
      return renderToStaticMarkup(h(Provider, { store }, h(MemoryRouter, null,
        h(CatalogPricingContext.Provider, { value: { reload() {}, ...pricing } }, element))))
    }
    await t.test('catalog cards hide all prices and add buttons while ON, loading or failed', () => {
      for (const pricing of [{ status: 'ready', enabled: true }, { status: 'loading', enabled: null }, { status: 'error', enabled: null }]) {
        const html = render(h(ProductCard, { product }), pricing)
        assert.doesNotMatch(html, /123\.45|Add to cart|3 left/)
        assert.match(html, /Choose location for store price/)
      }
      const html = render(h(ProductCard, { product }), { status: 'ready', enabled: false })
      assert.match(html, /123\.45/)
      assert.match(html, /Add to cart/)
    })
    await t.test('explicit storefront cards retain actual store price and purchase shortcut when ON', () => {
      const html = render(h(ProductCard, { product: { ...product, storefrontId: 'store' }, storeInventory: true }),
        { status: 'ready', enabled: true })
      assert.match(html, /123\.45/)
      assert.match(html, /Add to cart/)
    })
    await t.test('legacy cart prices and checkout stay hidden until scoped; OFF restores legacy checkout', () => {
      const old = [{ product: { id: 'product', name: 'Old catalog product', price: 123.45 }, quantity: 1 }]
      const child = h('p', null, 'Checkout form')
      const html = render(h(CartGuard, null, child), { status: 'ready', enabled: true }, old)
      assert.match(html, /Checkout is blocked/)
      assert.doesNotMatch(html, /123\.45|Checkout form/)
      assert.match(render(h(CartGuard, null, child), { status: 'ready', enabled: false }, old), /Checkout form/)
      assert.match(render(h(CartGuard, null, child), { status: 'ready', enabled: true },
        [{ product: { ...old[0].product, storefrontId: 'store' }, quantity: 1 }]), /Checkout form/)
      const failed = render(h(CartGuard, null, child), { status: 'error', enabled: null, error: 'Settings failed' }, old)
      assert.match(failed, /Settings failed|Retry pricing settings/)
      assert.doesNotMatch(failed, /Checkout form|123\.45/)
    })
    await t.test('details cannot show any price or add button without resolved customer location', () => {
      const html = render(h(Purchase, { productId: 'product' }), { status: 'ready', enabled: true })
      assert.match(html, /allow permission|allow location access|allow permission/i)
      assert.match(html, /Latitude|Longitude/)
      assert.match(html, /unavailable until a store is resolved/)
      assert.doesNotMatch(html, /price-tag|Add to cart/)
    })
    await t.test('owner management includes every shared category but only owns own edit/delete controls', () => {
      const html = render(h(StoreEditor, {
        store: { _id: 'store' },
        catalog: [{ ...product, name: 'Own catalog', createdByStore: { _id: 'store' } },
          { ...product, _id: 'other', name: 'Other catalog', createdByStore: 'other' }],
        categories: [{ _id: 'cat', name: 'Shared category', createdByStore: 'other' },
          { _id: 'own-cat', name: 'Own category', createdByStore: 'store' }],
        inventory: [], onSaved() {}, disabled: false,
      }), { status: 'ready', enabled: false })
      assert.match(html, /Shared category/)
      assert.match(html, /Own catalog/)
      assert.doesNotMatch(html, /Other catalog/)
      assert.equal((html.match(/>Edit your product</g) || []).length, 1)
      assert.equal((html.match(/>Edit your category</g) || []).length, 1)
      assert.match(html, /multiple=""/)
    })
    await t.test('adding a newly resolved existing line refreshes its current price and stock', () => {
      let state = cartReducer(undefined, addToCart({ product: { ...product, storefrontId: 'store', price: 10 }, quantity: 1 }))
      state = cartReducer(state, addToCart({ product: { ...product, storefrontId: 'store', price: 20, countInStock: 2, inventoryManaged: true }, quantity: 1 }))
      assert.equal(state.items.length, 1)
      assert.equal(state.items[0].product.price, 20)
      assert.equal(state.items[0].product.countInStock, 2)
      assert.equal(state.items[0].product.inventoryManaged, true)
      assert.equal(state.items[0].quantity, 2)
      assert.equal(state.items[0].product.storefrontId, 'store')
    })
    await t.test('late product-detail responses cannot overwrite a newer selected product or surface a stale error', () => {
      let state = productsReducer(undefined, fetchProductById.pending('old', 'old-product'))
      state = productsReducer(state, fetchProductById.pending('new', 'new-product'))
      state = productsReducer(state, fetchProductById.fulfilled({ _id: 'new-product' }, 'new', 'new-product'))
      state = productsReducer(state, fetchProductById.fulfilled({ _id: 'old-product' }, 'old', 'old-product'))
      state = productsReducer(state, fetchProductById.rejected(new Error('Old failure'), 'old', 'old-product'))
      assert.equal(state.selectedProduct._id, 'new-product')
      assert.equal(state.error, null)
      assert.equal(state.loading, false)
    })
  } finally {
    await server.close()
    await rm('node_modules\\.vite-catalog-tests', { recursive: true, force: true })
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor)
    else delete globalThis.localStorage
  }
})
