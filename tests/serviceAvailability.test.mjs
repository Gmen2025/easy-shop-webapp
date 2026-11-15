import test from 'node:test'
import assert from 'node:assert/strict'
import { rm } from 'node:fs/promises'
import { effectiveServiceAvailability, validateServiceAvailability } from '../src/utils/serviceAvailability.js'

test('availability requires both boolean switches, including OFF', () => {
  assert.deepEqual(validateServiceAvailability({ rides: false, services: true, financialHealth: false }),
    { rides: false, services: true, financialHealth: false })
  for (const value of [null, {}, { rides: true }, { rides: 0, services: true }, { rides: true, services: 'false' }]) {
    assert.throws(() => validateServiceAvailability(value), /could not be verified/)
  }
})
test('tester access makes disabled services available without changing the configured switches', () => {
  const raw = { rides: false, services: false, financialHealth: false, testingAccess: true }
  assert.deepEqual(effectiveServiceAvailability(raw), { rides: true, services: true, financialHealth: true, testingAccess: true })
  assert.equal(raw.financialHealth, false)
  assert.equal(effectiveServiceAvailability({ ...raw, testingAccess: false }).financialHealth, false)
  assert.throws(() => validateServiceAvailability({ ...raw, testingAccess: 'true' }), /could not be verified/)
})
test('maintenance binds access to the requested region and identity, ignores stale responses, and rejects malformed status', async () => {
  const { createServer } = await import('vite')
  const { configureStore } = await import('@reduxjs/toolkit')
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const originalFetch = globalThis.fetch
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } })
  let payload = { enabled: true, testingAccess: true }, options
  globalThis.fetch = async (url, request) => {
    options = request
    return new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json' } })
  }
  const cacheDir = '.maintenance-access-test-cache'
  const server = await createServer({
    cacheDir, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
  })
  try {
    const { default: reducer, fetchMaintenanceMode: fetchMode } =
      await server.ssrLoadModule('/src/features/maintenance/maintenanceSlice.js')
    const store = configureStore({ reducer })
    const access = { userId: 'tester', database: 'E_Shopping' }
    await store.dispatch(fetchMode(access))
    assert.equal(options.headers['x-database-name'], access.database)
    assert.equal(store.getState().accessUserId, 'tester')
    assert.equal(store.getState().accessDatabase, 'E_Shopping')
    store.dispatch(fetchMode.pending('older', access))
    const next = { userId: 'ordinary', database: 'E_ShopUSA' }
    store.dispatch(fetchMode.pending('newer', next))
    store.dispatch(fetchMode.fulfilled({ enabled: true, testingAccess: false }, 'newer', next))
    store.dispatch(fetchMode.fulfilled({ enabled: false, testingAccess: true }, 'older', access))
    assert.equal(store.getState().testingAccess, false)
    assert.equal(store.getState().enabled, true)
    assert.equal(store.getState().accessUserId, 'ordinary')
    assert.equal(store.getState().accessDatabase, 'E_ShopUSA')
    payload = { enabled: true, testingAccess: 'true' }
    await store.dispatch(fetchMode(next))
    assert.equal(store.getState().testingAccess, false)
    assert.match(store.getState().error, /could not be verified/)
  } finally {
    await server.close()
    await rm(cacheDir, { recursive: true, force: true })
    globalThis.fetch = originalFetch
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage)
    else delete globalThis.localStorage
  }
})
test('rendered admin switches and customer navigation respect availability without hiding history', async () => {
  const { createServer } = await import('vite')
  const { createElement } = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { MemoryRouter } = await import('react-router-dom')
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key) => key === 'selectedDatabaseName' ? 'E_Shopping' : null,
  } })
  const cacheDir = '.service-availability-test-cache'
  const virtual = '\0virtual:service-fixture'
  const server = await createServer({
    cacheDir, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [{
      name: 'service-availability-fixture', enforce: 'pre',
      resolveId(id) { if (id === 'virtual:service-fixture') return virtual },
      load(id) {
        if (id === virtual) return `
          export {useEffect,useRef} from 'react'
          let state={}, values=[]
          export function setup(next, preset=[]) {state=next;values=[...preset]}
          export function useState(initial) {return [values.length ? values.shift() : typeof initial==='function' ? initial() : initial,()=>{}]}
          export function useAvailability() {return {...state,reload:()=>{}}}
          export function useDispatch() {return ()=>{}}
          export function useSelector(select) {return select({auth:{user:{_id:'customer',name:'Customer'}},cart:{items:[]}})}
        `
      },
      transform(code, id) {
        if (id.endsWith('/useFinancialHealth.js')) {
          return code.replace("from 'react-redux'", "from 'virtual:service-fixture'")
        }
        if (['Header.jsx', 'ServiceRequestPage.jsx', 'ServiceAvailabilitySettingsPage.jsx', 'ProfilePage.jsx', 'MyRidesPage.jsx']
          .some((name) => id.endsWith(`/${name}`))) {
          return code.replace("from 'react'", "from 'virtual:service-fixture'")
            .replace("from 'react-redux'", "from 'virtual:service-fixture'")
            .replace(/import useServiceAvailability from '[^']+'/,
              "import {useAvailability as useServiceAvailability} from 'virtual:service-fixture'")
        }
      },
    }],
  })
  try {
    const { setup } = await server.ssrLoadModule('virtual:service-fixture')
    const { default: Header } = await server.ssrLoadModule('/src/components/Header.jsx')
    const { default: Form } = await server.ssrLoadModule('/src/pages/ServiceRequestPage.jsx')
    const { default: Admin } = await server.ssrLoadModule('/src/pages/ServiceAvailabilitySettingsPage.jsx')
    const { default: Profile } = await server.ssrLoadModule('/src/pages/ProfilePage.jsx')
    const { default: History } = await server.ssrLoadModule('/src/pages/MyRidesPage.jsx')
    const render = (Component, settings, preset = [], error = '') => {
      setup({ settings, error }, preset)
      return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Component)))
    }
    for (const settings of [{ rides: false, services: false }, { rides: true, services: false }, { rides: false, services: true }]) {
      const html = render(Header, settings, [true])
      assert.equal(html.includes('href="/rides"'), settings.rides)
      assert.equal(html.includes('href="/service-request"'), settings.services)
      assert.ok(html.includes('href="/rides/mine"'))
      assert.ok(html.includes('href="/service-requests"'))
    }
    const blocked = render(Form, { rides: true, services: false })
    assert.match(blocked, /New service requests are disabled/)
    assert.ok(!blocked.includes('<form'))
    assert.match(blocked, /href="\/service-requests"/)
    const unavailable = render(Form, null, [], 'Availability unavailable')
    assert.match(unavailable, /role="alert"/)
    assert.match(unavailable, /Availability unavailable/)
    assert.ok(!unavailable.includes('<form'))
    const admin = render(Admin, null, ['E_ShopUSA',
      { rides: false, services: true, financialHealth: false, testingAccess: true }, false, '', '', 0])
    assert.match(admin, /role="switch"[^>]*aria-label="Enable Ride service"[^>]*aria-checked="false"/)
    assert.match(admin, /role="switch"[^>]*aria-label="Enable Service requests"[^>]*aria-checked="true"/)
    assert.match(admin, /role="switch"[^>]*aria-label="Enable Financial Health"[^>]*aria-checked="false"/)
    assert.match(admin, /Approved testers/)
    assert.match(admin, /value="E_ShopUSA" selected=""/)
    const profile = render(Profile, { rides: false, services: false })
    assert.ok(!profile.includes('href="/service-request"'))
    assert.ok(profile.includes('href="/service-requests"'))
    const history = render(History, { rides: false, services: false }, [[], null, false, false, ''])
    assert.match(history, /My rides/)
    assert.ok(!history.includes('href="/rides"'))
  } finally {
    await server.close()
    await rm(cacheDir, { recursive: true, force: true })
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage)
    else delete globalThis.localStorage
  }
})
