import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { businessPath, validateBusiness } from '../src/utils/operatorWorkspace.js'

test('every business surface uses explicit admin account scope, never self or impersonation', () => {
  assert.equal(businessPath('store', 'a/b', 'dashboard'), '/stores/admin/a%2Fb/dashboard')
  assert.equal(businessPath('store', 'store1', 'assignments'), '/stores/admin/store1/assignments')
  assert.equal(businessPath('store', 'store1', 'reviews'), '/stores/store1/reviews')
  assert.equal(businessPath('store', 'store1', 'fulfillment'), '/products/admin/stores/store1/fulfillment-products')
  assert.equal(businessPath('driver', 'driver1', 'rides'), '/rides/admin/drivers/driver1/dashboard')
  for (const view of ['queue', 'available-deliveries', 'completed-today', 'wallet', 'dashboard']) {
    assert.equal(businessPath('driver', 'driver1', view), `/drivers/admin/driver1/${view}`)
  }
  for (const kind of ['store', 'driver']) {
    assert.equal(businessPath(kind, 'id', 'profile'), `/finance/accounts/${kind}/id/profile`)
    assert.throws(() => businessPath(kind, 'me', 'dashboard'), /Select/)
  }
  assert.throws(() => businessPath('user', 'id', 'profile'), /Select/)
  assert.throws(() => businessPath('store', 'id', 'wallet'), /Unsupported/)
})

test('malformed business snapshots cannot display success-shaped empty dashboards', () => {
  for (const [kind, view] of [['store', 'dashboard'], ['driver', 'dashboard'], ['driver', 'rides'],
    ['driver', 'wallet'], ['store', 'profile'], ['store', 'assignments'], ['driver', 'queue'],
    ['driver', 'completed-today'], ['driver', 'available-deliveries'], ['store', 'reviews'], ['store', 'fulfillment']]) {
    assert.throws(() => validateBusiness({}, kind, view), /invalid|incomplete|Invalid/)
  }
  assert.deepEqual(validateBusiness([], 'store', 'assignments'), [])
  assert.deepEqual(validateBusiness({ queue: [] }, 'driver', 'queue'), { queue: [] })
  assert.deepEqual(validateBusiness({ reviews: [] }, 'store', 'reviews'), { reviews: [] })
  assert.throws(() => validateBusiness({ account: { _id: 'id' }, locations: [] }, 'store', 'profile'), /Invalid/)
  assert.throws(() => validateBusiness({ walletBalance: NaN, transactions: [] }, 'driver', 'wallet'), /Invalid/)
})

test('admin workspaces render every operator section without self-service operational actions', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } })
  const { createServer } = await import('vite')
  const { createElement } = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { MemoryRouter, Routes, Route } = await import('react-router-dom')
  const cacheDir = await mkdtemp(join(tmpdir(), 'operator-workspace-'))
  const hooksId = '\0virtual:operator-workspace-hooks'
  const resourceId = '\0virtual:operator-workspace-resource'
  const server = await createServer({
    cacheDir, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [{
      name: 'operator-workspace-fixture', enforce: 'pre',
      resolveId(id) {
        if (id === 'virtual:operator-workspace-hooks') return hooksId
        if (id === 'virtual:operator-workspace-resource') return resourceId
      },
      load(id) {
        if (id === hooksId) return `import * as React from 'react'
          export const { useCallback } = React
          let view = 'dashboard', index = 0
          export function reset(value) { view = value; index = 0 }
          export function useState(initial) { return React.useState(index++ === 0 ? view : initial) }`
        if (id === resourceId) return `let fixtures = {}
          export function setup(value) { fixtures = value }
          export default function resource(path, validate) {
            if (!(path in fixtures)) throw new Error('Unexpected request: ' + path)
            return { data: validate(fixtures[path]), loading: false, error: '', reload: async () => {} }
          }
          export function useCompanyAction() { return { busy: false, error: '', notice: '', run: async () => {} } }`
      },
      transform(code, id) {
        if (id.endsWith('/AdminAccountPage.jsx')) return code.replace("from 'react'", "from 'virtual:operator-workspace-hooks'")
          .replace("from '../features/company/useCompanyResource'", "from 'virtual:operator-workspace-resource'")
      },
    }],
  })
  try {
    const { default: Page } = await server.ssrLoadModule('/src/pages/AdminAccountPage.jsx')
    const { reset } = await server.ssrLoadModule('virtual:operator-workspace-hooks')
    const { setup } = await server.ssrLoadModule('virtual:operator-workspace-resource')
    const periods = Object.fromEntries(['daily', 'weekly', 'monthly', 'quarterly', 'yearly'].map((period) =>
      [period, { sales: 30, earnings: 30, orders: 1, completedOrders: 1, unitsSold: 3, averageOrder: 30, reviews: 0, averageRating: 0 }]))
    const profile = { account: { _id: 'store1', name: 'Scoped market', isCompanyOwned: false }, owner: { name: 'Scoped owner' }, locations: [], inventoryEnabled: true }
    setup({
      '/stores/admin/store1/dashboard': { success: true, store: { name: 'Scoped market' }, periods,
        products: { total: 1, approved: 1, pending: 0, readyFulfillments: 0 },
        inventory: { unitsInStock: 3, value: 30, lowStock: 0, outOfStock: 0 },
        orders: { pending: 1 }, payouts: { paidOut: 0, pending: 0, available: 0 },
        activeOrders: [{ _id: 'order1', orderItems: [{ product: { name: 'Scoped apples' }, quantity: 3, unitPrice: 10 }] }], recentOrders: [] },
      '/finance/accounts/store/store1/profile': profile,
      '/stores/admin/store1/assignments': [{ _id: 'assignment1', fulfillmentStatus: 'accepted', orderItems: [] }],
      '/products/admin/stores/store1/fulfillment-products': { products: [{ _id: 'product1', name: 'Scoped apples', price: 10 }] },
      '/stores/store1/reviews': { reviews: [{ id: 'review1', rating: 5, comment: 'Scoped review' }] },
      '/drivers/admin/driver1/dashboard': { success: true, periods: Object.fromEntries(Object.keys(periods).map((period) =>
        [period, { income: 15, deliveries: 1, averageFee: 15, distanceKm: 2 }])), recentDeliveries: [] },
      '/finance/accounts/driver/driver1/profile': { ...profile, account: { _id: 'driver1', name: 'Scoped driver' } },
      '/drivers/admin/driver1/queue': { queue: [{ orderId: 'delivery1', deliveryStatus: 'Driver Assigned', storeName: 'Scoped pickup' }] },
      '/drivers/admin/driver1/available-deliveries': { orders: [], driverEligibility: { message: 'Scoped eligibility' } },
      '/drivers/admin/driver1/completed-today': { orders: [] },
      '/drivers/admin/driver1/wallet': { walletBalance: 25, transactions: [{ _id: 'wallet1', amount: 25, type: 'deposit' }] },
      '/rides/admin/drivers/driver1/dashboard': { driver: { name: 'Scoped driver', serviceModes: { delivery: true } }, riders: [], payments: [], trip: null, offer: null },
    })
    const render = (kind, view) => {
      reset(view)
      const path = `/admin/accounts/${kind}/${kind}1`
      return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] },
        createElement(Routes, null, createElement(Route, { path: '/admin/accounts/:kind/:accountId', element: createElement(Page) }))))
    }
    assert.match(render('store', 'dashboard'), /Scoped apples/)
    assert.match(render('store', 'profile'), /Scoped owner/)
    assert.match(render('store', 'assignments'), /accepted/)
    assert.match(render('store', 'fulfillment'), /Scoped apples/)
    assert.match(render('store', 'reviews'), /Scoped review/)
    assert.match(render('store', 'notify'), /Saved in the website\/app inbox/)
    assert.match(render('driver', 'queue'), /Scoped pickup/)
    assert.match(render('driver', 'available-deliveries'), /Scoped eligibility/)
    assert.match(render('driver', 'completed-today'), /No orders or deliveries/)
    assert.match(render('driver', 'wallet'), /Commission wallet \(not earned income\)/)
    assert.match(render('driver', 'rides'), /No active trip/)
    for (const kind of ['store', 'driver']) {
      assert.doesNotMatch(render(kind, 'dashboard'), />Claim delivery<|>Confirm picked up<|>Dispatch selected<|>Start trip to pickup</)
    }
  } finally {
    await server.close()
    await rm(cacheDir, { recursive: true, force: true })
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor)
    else delete globalThis.localStorage
  }
})
