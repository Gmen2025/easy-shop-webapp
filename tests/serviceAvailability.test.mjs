import test from 'node:test'
import assert from 'node:assert/strict'
import { rm } from 'node:fs/promises'
import { validateServiceAvailability } from '../src/utils/serviceAvailability.js'

test('availability requires both boolean switches, including OFF', () => {
  assert.deepEqual(validateServiceAvailability({ rides: false, services: true }), { rides: false, services: true })
  for (const value of [null, {}, { rides: true }, { rides: 0, services: true }, { rides: true, services: 'false' }]) {
    assert.throws(() => validateServiceAvailability(value), /could not be verified/)
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
    const admin = render(Admin, null, ['E_ShopUSA', { rides: false, services: true }, false, '', '', 0])
    assert.match(admin, /role="switch"[^>]*aria-label="Enable Ride service"[^>]*aria-checked="false"/)
    assert.match(admin, /role="switch"[^>]*aria-label="Enable Service requests"[^>]*aria-checked="true"/)
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
