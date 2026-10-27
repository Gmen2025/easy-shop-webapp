import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  COMPANY_PERIODS, companyRoles, companyTabs, isCompanyDriver, isDeliveryDriver, isCompanyStoreOwner,
  requireList, validateCompanyDashboard, validateDriverRides, assignmentSeconds, inventoryPayload, driverRideFare,
} from '../src/utils/company.js'

const owner = { _id: 'owner', name: 'Company owner', isStoreOwner: true, isCompanyOwnedStore: true }
const driver = { _id: 'driver', name: 'Company driver', isDriver: true, isCompanyOwnedDriver: true }
const period = { sales: 100, earnings: 100, orders: 2, completedOrders: 1, unitsSold: 4,
  averageOrder: 100, reviews: 1, averageRating: 4.5 }
function storeDashboard() {
  return { success: true, periods: Object.fromEntries(COMPANY_PERIODS.map(([key]) => [key, { ...period }])),
    products: { total: 3, approved: 2, pending: 1, readyFulfillments: 1 },
    inventory: { unitsInStock: 10, value: 100, lowStock: 1, outOfStock: 0 },
    payouts: { paidOut: 10, pending: 0, available: 90 }, orders: { pending: 1 }, activeOrders: [], recentOrders: [] }
}

test('website gates individual and combined drop-offs per cart while leaving pickups and completed carts available', async () => {
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } })
  const { createServer } = await import('vite')
  const { createElement } = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { Provider } = await import('react-redux')
  const { MemoryRouter } = await import('react-router-dom')
  const { configureStore } = await import('@reduxjs/toolkit')
  const cacheDir = await mkdtemp(join(tmpdir(), 'cart-pickup-gate-'))
  const hooksId = '\0virtual:driver-delivery-hooks'
  const server = await createServer({
    cacheDir, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [{
      name: 'driver-delivery-state-fixture', enforce: 'pre',
      resolveId(id) { if (id === 'virtual:driver-delivery-hooks') return hooksId },
      load(id) {
        if (id !== hooksId) return
        return `import * as React from 'react'
          export const { useCallback, useEffect, useRef } = React
          let states = {}, index = 0
          export function reset(value) { states = value; index = 0 }
          export function useState(initial) {
            const current = index++
            return React.useState(current in states ? states[current] : initial)
          }`
      },
      transform(code, id) {
        if (id.endsWith('/DriverDeliveriesPage.jsx')) {
          return code.replace("from 'react'", "from 'virtual:driver-delivery-hooks'")
        }
      },
    }],
  })
  try {
    const { reset } = await server.ssrLoadModule('virtual:driver-delivery-hooks')
    const { default: Page } = await server.ssrLoadModule('/src/pages/DriverDeliveriesPage.jsx')
    const store = configureStore({ reducer: { auth: () => ({ user: driver }) } })
    const queue = [
      { orderId: 'a', cartRouteVersion: 1, checkoutGroup: 'cart1', deliveryStatus: 'Picked Up',
        dropoffReady: false, pendingPickupOrderIds: ['b'], address: { address1: 'Home' }, store: { name: 'Store A' } },
      { orderId: 'b', cartRouteVersion: 1, checkoutGroup: 'cart1', deliveryStatus: 'Driver Assigned',
        dropoffReady: false, pendingPickupOrderIds: ['b'], store: { name: 'Store B' } },
      { orderId: 'c', cartRouteVersion: 1, checkoutGroup: 'cart2', deliveryStatus: 'Picked Up',
        dropoffReady: true, pendingPickupOrderIds: [], address: { address1: 'Other home' }, store: { name: 'Store C' } },
    ]
    const routeStops = [
      { key: 'pickup:b', type: 'pickup', name: 'Store B', orderIds: ['b'], requires: [] },
      { key: 'dropoff:a', type: 'dropoff', name: 'Home', orderIds: ['a'], requires: ['pickup:b'] },
      { key: 'dropoff:c', type: 'dropoff', name: 'Other home', orderIds: ['c'], requires: [] },
    ]
    const render = (selectedId, offers = []) => {
      reset({ 1: offers, 2: queue, 3: routeStops, 5: selectedId })
      return renderToStaticMarkup(createElement(Provider, { store },
        createElement(MemoryRouter, null, createElement(Page))))
    }
    const markup = render('a')
    const buttons = [...markup.matchAll(/<button\b([^>]*)>(.*?)<\/button>/gs)]
    const matching = (label) => buttons.filter((match) => match[2] === label).map((match) => /\bdisabled/.test(match[1]))
    assert.deepEqual(matching('Show this stop'), [false, true, false])
    assert.deepEqual(matching('Show current leg on Google Maps'), [true, false, false])
    assert.deepEqual(matching('Confirm drop-off / delivered'), [true, false])
    assert.deepEqual(matching('Confirm picked up'), [false])
    assert.match(markup, /Complete all pickups for this customer cart before opening drop-off directions/)
    assert.doesNotMatch(markup, /delivery-map-panel/)
    assert.match(render('c'), /delivery-map-panel/, 'A fully collected different cart can open its route')
    assert.doesNotMatch(markup, />Reroute accepted delivery<|>Reject accepted delivery</)
    queue[1].canRerouteBeforePickup = true
    const releasable = render('')
    assert.match(releasable, />Reroute accepted delivery</)
    assert.match(releasable, />Reject accepted delivery</)
    queue[1].canRerouteBeforePickup = false
    queue[0].dropoffReady = queue[1].dropoffReady = true
    queue[1].deliveryStatus = 'Picked Up'
    assert.match(render('a'), /delivery-map-panel/, 'The cart unlocks after its final pickup')
    const backlog = render('', [
      { _id: 'offline', store: { name: 'Unclaimed store' }, items: [], deliveryFee: 5,
        sharedAssignment: true, canClaim: false, canRespond: true },
      { _id: 'available', store: { name: 'Ready store' }, items: [], deliveryFee: 5,
        sharedAssignment: true, canClaim: true, canRespond: true },
    ])
    assert.match(backlog, /Unclaimed store/)
    assert.match(backlog, /Queued until you are online/)
    assert.deepEqual([...backlog.matchAll(/<button\b([^>]*)>Claim delivery<\/button>/g)]
      .map((match) => /\bdisabled/.test(match[1])), [true, false])
    for (const label of ['Reroute offer', 'Reject delivery']) {
      assert.deepEqual([...backlog.matchAll(new RegExp(`<button\\b([^>]*)>${label}</button>`, 'g'))]
        .map((match) => /\bdisabled/.test(match[1])), [false, false])
    }
    assert.match(backlog, /Reject also flags it for Admin review without pausing delivery/)
    const partnerBacklog = render('', [{ _id: 'partner', items: [], canRespond: false }])
    assert.doesNotMatch(partnerBacklog, />Reroute offer<|>Reject delivery</)
    const upcoming = render('', [{ _id: 'scheduled', items: [], upcoming: true, canClaim: true, canRespond: true,
      packageDeliveryWindows: [{ orderId: 'package-1', deliveryWindowStart: '2026-10-29T13:00:00Z',
        deliveryWindowEnd: '2026-10-29T15:00:00Z' }] }])
    assert.match(upcoming, /Upcoming scheduled delivery/)
    assert.match(upcoming, /You may claim now/)
    assert.match(upcoming, /Package #package-1/)
    assert.ok(upcoming.includes(new Date('2026-10-29T13:00:00Z').toLocaleString()))
    assert.ok(upcoming.includes(new Date('2026-10-29T15:00:00Z').toLocaleString()))
    assert.doesNotMatch(upcoming, /Queued until you are online/)
    assert.match(upcoming, />Reroute offer</)
    assert.doesNotMatch(upcoming, /<button\b[^>]*disabled[^>]*>Claim delivery<\/button>/)
  } finally {
    await server.close()
    await rm(cacheDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    if (storageDescriptor) Object.defineProperty(globalThis, 'localStorage', storageDescriptor)
    else delete globalThis.localStorage
  }
})

test('company role tabs match mobile eligibility without changing customer or admin navigation', () => {
  assert.equal(isCompanyStoreOwner(owner), true)
  assert.equal(isCompanyDriver(driver), true)
  for (const user of [null, {}, { isStoreOwner: true }, { ...owner, ...driver, isAdmin: true }]) {
    assert.equal(isCompanyStoreOwner(user), false)
    assert.equal(isCompanyDriver(user), false)
    assert.ok(companyTabs(user).some((tab) => tab.to === '/stores'))
    assert.equal(companyTabs(user).length, 4)
  }
  assert.deepEqual(companyTabs(owner).map((tab) => tab.label), ['Shop', 'Store Owner', 'Cart', 'Account'])
  assert.deepEqual(companyTabs(driver).map((tab) => tab.label), ['Shop', 'Stores', 'Cart', 'Company Driver', 'Account'])
  assert.deepEqual(companyTabs({ ...owner, ...driver }).map((tab) => tab.to), ['/', '/store-owner', '/cart', '/driver', '/profile'])
  assert.equal(companyTabs(null).at(-1).to, '/login')
  assert.equal(companyTabs(owner)[0].end, true)
  assert.equal(isCompanyDriver({ isDriver: true }), false)
  assert.equal(isDeliveryDriver({ isDriver: true }), true)
  assert.equal(isDeliveryDriver({ isDriver: true, isAdmin: true }), false)
  assert.deepEqual(companyTabs({ isDriver: true }).map((tab) => tab.label), ['Shop', 'Stores', 'Cart', 'Driver', 'Account'])
  assert.equal(companyTabs(driver).find((tab) => tab.to === '/driver').end, undefined)
  assert.deepEqual(companyRoles({}, owner), { isDriver: false, isCompanyOwnedDriver: false, isStoreOwner: true, isCompanyOwnedStore: true })
  assert.equal(companyRoles({ isCompanyOwnedStore: false }, owner).isCompanyOwnedStore, false)
})

test('analytics require every real backend period and never invent zeros on malformed responses', () => {
  const data = storeDashboard()
  assert.equal(validateCompanyDashboard(data, 'store'), data)
  for (const modify of [
    (value) => { delete value.periods.weekly },
    (value) => { value.periods.daily.sales = '100' },
    (value) => { value.inventory.value = NaN },
    (value) => { value.payouts = null },
    (value) => { value.success = false },
    (value) => { value.activeOrders = {} },
  ]) {
    const invalid = storeDashboard(); modify(invalid)
    assert.throws(() => validateCompanyDashboard(invalid, 'store'), /incomplete|invalid/)
  }
  const earnings = { success: true, periods: Object.fromEntries(COMPANY_PERIODS.map(([key]) =>
    [key, { income: 25, deliveries: 1, averageFee: 25, distanceKm: 5 }])), recentDeliveries: [] }
  assert.equal(validateCompanyDashboard(earnings, 'driver'), earnings)
  earnings.periods.yearly.income = Infinity
  assert.throws(() => validateCompanyDashboard(earnings, 'driver'), /incomplete/)
  assert.throws(() => requireList([null], 'orders'), /invalid orders/)
})

test('assignment expiry and physical-stock input retain the mobile/backend semantics', () => {
  const now = Date.parse('2026-10-25T12:00:00Z')
  assert.equal(assignmentSeconds({ fulfillmentDeadline: '2026-10-25T12:01:01Z' }, now), 61)
  assert.equal(assignmentSeconds({ fulfillmentDeadline: '2026-10-25T11:59:00Z' }, now), 0)
  assert.equal(assignmentSeconds({}, now), 0)
  assert.deepEqual(inventoryPayload({ price: '0', countInStock: '10', minStock: '0' }), { price: 0, countInStock: 10, minStock: 0 })
  for (const stock of [
    { price: '', countInStock: '1', minStock: '5' },
    { price: '1', countInStock: '1.5', minStock: '5' },
    { price: '-1', countInStock: '1', minStock: '5' },
    { price: '1', countInStock: '1', minStock: 'NaN' },
  ]) assert.throws(() => inventoryPayload(stock), /nonnegative/)
})

test('ride data and fares fail explicitly for malformed offers and missing amounts', () => {
  const data = { driver: { isAvailable: true, serviceModes: { delivery: true } }, payments: [], riders: [], trip: null, offer: null }
  assert.equal(validateDriverRides(data), data)
  assert.doesNotThrow(() => validateDriverRides({ ...data, driver: { serviceModes: { delivery: true } } }))
  assert.throws(() => validateDriverRides({ ...data, driver: { ...data.driver, isAvailable: 'false' } }), /invalid/)
  assert.throws(() => validateDriverRides({ ...data, payments: {} }), /invalid/)
  assert.throws(() => validateDriverRides({ ...data, offer: { stops: [], offerDeadline: 'bad' } }), /invalid/)
  assert.equal(driverRideFare({ currency: 'usd', finalFare: 0 }), 'USD 0.00')
  assert.equal(driverRideFare({ currency: 'etb', estimate: 50 }), 'ETB 50.00')
  assert.equal(driverRideFare({ currency: 'etb' }), 'Fare unavailable')
})

test('website routes, responsive role tabs and authentication preserve company roles', async () => {
  const { createServer } = await import('vite')
  const { createElement } = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { MemoryRouter } = await import('react-router-dom')
  const { Provider } = await import('react-redux')
  const { configureStore } = await import('@reduxjs/toolkit')
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const storage = new Map()
  globalThis.localStorage = { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) }
  const cacheDir = await mkdtemp(join(tmpdir(), 'company-test-'))
  const server = await createServer({ cacheDir, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
  try {
    const { default: App } = await server.ssrLoadModule('/src/App.jsx')
    const { default: reducer, loginUser, verifyTwoFactor, finishSocialSignIn, updateProfile, logout, saveUserProfile, fetchCurrentUserProfile } =
      await server.ssrLoadModule('/src/features/auth/authSlice.js')
    const signIn = { user: { ...owner, ...driver }, token: 'company-test-token' }
    let auth = reducer(undefined, loginUser.fulfilled(signIn, 'request', {}))
    assert.equal(isCompanyDriver(auth.user), true)
    assert.equal(isCompanyStoreOwner(auth.user), true)
    auth = reducer(auth, updateProfile({ name: 'Updated name' }))
    assert.equal(isCompanyDriver(auth.user), true)
    assert.equal(isCompanyStoreOwner(JSON.parse(storage.get('authUser'))), true)
    const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch')
    try {
      globalThis.fetch = async () => new Response(JSON.stringify({ user: { _id: 'owner', name: 'Saved company name' } }),
        { headers: { 'Content-Type': 'application/json' } })
      const profileStore = configureStore({ reducer: { auth: reducer }, preloadedState: { auth } })
      await profileStore.dispatch(saveUserProfile({ name: 'Saved company name' })).unwrap()
      assert.equal(isCompanyStoreOwner(profileStore.getState().auth.user), true)
      assert.equal(isCompanyDriver(profileStore.getState().auth.user), true)
    } finally {
      if (fetchDescriptor) Object.defineProperty(globalThis, 'fetch', fetchDescriptor)
      else delete globalThis.fetch
    }
    auth = reducer(auth, logout())
    assert.equal(auth.user, null)
    auth = reducer(auth, fetchCurrentUserProfile.fulfilled({ user: signIn.user }, 'request', undefined))
    assert.equal(auth.user, null, 'a late startup profile response must not restore a signed-out account')
    for (const thunk of [verifyTwoFactor, finishSocialSignIn]) {
      auth = reducer(auth, thunk.fulfilled({ data: signIn, database: 'E_Shopping' }, 'request', {}))
      assert.equal(isCompanyDriver(auth.user), true)
      assert.equal(isCompanyStoreOwner(auth.user), true)
    }
    const render = (path, user, maintenance = false) => {
      const store = configureStore({ reducer: {
        auth: () => ({ user, token: user ? 'company-test-token' : null }),
        cart: () => ({ items: [] }),
        maintenance: () => ({ enabled: maintenance }),
      } })
      return renderToStaticMarkup(createElement(Provider, { store }, createElement(MemoryRouter, { initialEntries: [path] }, createElement(App))))
    }
    for (const [path, title] of [
      ['/store-owner', 'Business overview'], ['/store-owner/manage', 'My store &amp; inventory'],
      ['/store-owner/assignments', 'Store assignments'], ['/store-owner/orders/order-a', 'Order products'],
    ]) {
      const html = render(path, owner)
      assert.ok(html.includes(title), path)
      assert.match(html, /href="\/store-owner"/)
      assert.doesNotMatch(html, /Company account required/)
      assert.match(render(path, driver), /Company account required/)
      assert.match(render(path, { isAdmin: true }), /Company account required/)
      assert.doesNotMatch(render(path, null), /Company account required|Loading store analytics/)
    }
    for (const path of ['/driver', '/driver/deliveries', '/driver/rides', '/driver/rides/trip']) {
      const html = render(path, driver)
      assert.match(html, /Company Driver/)
      assert.doesNotMatch(html, /Company account required/)
      assert.match(render(path, owner), /Company account required/)
      if (path.includes('/rides')) assert.match(render(path, { isDriver: true }), /Company account required/)
      else {
        const partnerHtml = render(path, { isDriver: true })
        assert.doesNotMatch(partnerHtml, /Company account required|Passenger assignments/)
        assert.match(partnerHtml, /Available Delivery Assignments/)
      }
    }
    assert.match(render('/driver', driver, true), /maintenance/i)
    assert.match(render('/store-owner', owner, true), /maintenance/i)
  } finally {
    await server.close()
    await rm(cacheDir, { recursive: true, force: true })
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor)
    else delete globalThis.localStorage
  }
})
