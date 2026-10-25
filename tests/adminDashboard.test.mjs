import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ADMIN_PERIODS, ADMIN_TOOLS, validateDashboard } from '../src/utils/adminDashboard.js'
import { normalizeLowStockThreshold } from '../src/utils/inventory.js'

function fixture() {
  const period = { totalSales: 125, productSales: 100, deliveryIncome: 25, orders: 4,
    completedOrders: 2, cancelledOrders: 1, paidOrders: 1, pendingPaymentOrders: 1,
    unitsSold: 3, deliveryDistanceKm: 12, averageOrder: 62.5, averageDeliveryFee: 12.5,
    paymentMethods: { Cash: 125 } }
  return { success: true, periods: Object.fromEntries(ADMIN_PERIODS.map(([key]) => [key, structuredClone(period)])),
    operations: { outstandingOrders: 2, activeDeliveries: 1 },
    inventory: { products: 10, unitsInStock: 20, lowStock: 2, outOfStock: 1, value: 200 },
    payouts: { paid: 60, pending: 40 }, lifetime: { totalSales: 300, completedOrders: 6 },
    recentSales: [{ _id: 'order-a', totalSales: 125, productSales: 100, deliveryIncome: 25, completedAt: '2026-06-01T12:00:00Z' }] }
}

test('dashboard preserves real backend rolling periods and revenue components', () => {
  const data = fixture()
  assert.equal(validateDashboard(data), data)
  assert.deepEqual(ADMIN_PERIODS.map(([key]) => key), ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'])
  assert.equal(data.periods.daily.totalSales, data.periods.daily.productSales + data.periods.daily.deliveryIncome)
  const empty = fixture()
  empty.recentSales = []
  empty.periods.daily.paymentMethods = {}
  assert.equal(validateDashboard(empty), empty)
})

test('incomplete or malformed analytics fail explicitly instead of showing invented zeros', () => {
  for (const modify of [
    (data) => { delete data.periods.weekly },
    (data) => { data.periods.monthly.totalSales = '125' },
    (data) => { data.periods.yearly.paymentMethods.Cash = Infinity },
    (data) => { data.periods.yearly.paymentMethods = [] },
    (data) => { delete data.operations.activeDeliveries },
    (data) => { data.inventory.value = null },
    (data) => { data.payouts = null },
    (data) => { data.lifetime.totalSales = NaN },
    (data) => { data.recentSales[0].completedAt = 'invalid' },
    (data) => { data.recentSales[0] = null },
    (data) => { data.success = false },
  ]) {
    const data = fixture(); modify(data)
    assert.throws(() => validateDashboard(data), /incomplete sales analytics/)
  }
})

test('all mobile management surfaces are reachable from web admin navigation', () => {
  assert.equal(normalizeLowStockThreshold(0), 0)
  assert.equal(normalizeLowStockThreshold(5), 5)
  const titles = ADMIN_TOOLS.map(([title]) => title)
  for (const title of ['Products', 'Categories', 'Orders', 'Inventory', 'Delivery', 'Vehicles', 'Rides',
    'FX Rate', 'US Shipping', 'Payments', 'Bank Accounts', 'Payouts', 'Drivers', 'Store Owners',
    'Stores', 'Assign Roles', 'Notifications', 'Maintenance', 'Social Sign-in', 'Service Requests']) {
    assert.ok(titles.includes(title), title)
  }
  assert.equal(new Set(ADMIN_TOOLS.map(([, , to]) => to)).size, ADMIN_TOOLS.length)
  assert.ok(ADMIN_TOOLS.every(([, , to]) => to.startsWith('/admin/')))
})

test('admin dashboard and focused catalog screens render accessible controls without losing inventory tools', async () => {
  const { createServer } = await import('vite')
  const { createElement } = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { MemoryRouter, Routes, Route } = await import('react-router-dom')
  const { Provider } = await import('react-redux')
  const { configureStore } = await import('@reduxjs/toolkit')
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  globalThis.localStorage = { getItem: () => null, setItem: () => {} }
  const cacheDir = await mkdtemp(join(tmpdir(), 'admin-dashboard-test-'))
  const server = await createServer({ cacheDir, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
  try {
    const { default: Home } = await server.ssrLoadModule('/src/pages/AdminHomePage.jsx')
    const { default: Tools } = await server.ssrLoadModule('/src/pages/AdminDashboardPage.jsx')
    const store = configureStore({ reducer: {
      admin: () => ({ products: [], categories: [], orders: [], bankAccounts: [], status: 'succeeded', actionStatus: 'idle' }),
      maintenance: () => ({ enabled: false, status: 'succeeded', updateStatus: 'idle' }),
    } })
    const render = (path, Component, route) => renderToStaticMarkup(createElement(Provider, { store },
      createElement(MemoryRouter, { initialEntries: [path] }, createElement(Routes, null,
        createElement(Route, { path: route, element: createElement(Component) })))))
    const home = render('/admin', Home, '/admin')
    assert.match(home, /Sales dashboard/)
    assert.match(home, /aria-label="Sales period"/)
    assert.match(home, /Loading business analytics/)
    for (const [, , to] of ADMIN_TOOLS) assert.ok(home.includes(`href="${to}"`), to)
    const inventory = render('/admin/tools/inventory', Tools, '/admin/tools/:section')
    assert.match(inventory, /Low Stock Alerts/)
    assert.match(inventory, /admin-product-editor/)
    assert.match(inventory, /Rating \(0-5\)/)
    assert.match(inventory, /Number of reviews/)
    assert.doesNotMatch(inventory, /<h3>Orders<\/h3>/)
    const categories = render('/admin/tools/categories', Tools, '/admin/tools/:section')
    assert.match(categories, /Add Category/)
    assert.doesNotMatch(categories, /admin-product-editor/)
    const orders = render('/admin/tools/orders', Tools, '/admin/tools/:section')
    assert.match(orders, /Search orders/)
    assert.match(orders, /All statuses/)
    const { default: adminReducer, fetchAdminCatalog } = await server.ssrLoadModule('/src/features/admin/adminSlice.js')
    const requests = []
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (url) => {
      const path = new URL(url, 'http://localhost').pathname
      requests.push(path)
      const data = path.endsWith('/products') ? [{ _id: 'p', name: 'Test product' }]
        : path.endsWith('/categories') ? [{ _id: 'c', name: 'Test category' }]
          : [{ _id: 'o', status: 'Pending' }]
      return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
    }
    try {
      const scopedStore = configureStore({ reducer: { admin: adminReducer } })
      await scopedStore.dispatch(fetchAdminCatalog('products')).unwrap()
      assert.ok(requests.every((path) => /\/(categories|products)$/.test(path)))
      requests.length = 0
      await scopedStore.dispatch(fetchAdminCatalog('orders')).unwrap()
      assert.equal(requests.length, 1)
      assert.match(requests[0], /\/orders$/)
      assert.equal(scopedStore.getState().admin.products[0].name, 'Test product')
      assert.equal(scopedStore.getState().admin.orders[0]._id, 'o')
    } finally { globalThis.fetch = originalFetch }
  } finally {
    await server.close()
    await rm(cacheDir, { recursive: true, force: true })
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor)
    else delete globalThis.localStorage
  }
})
