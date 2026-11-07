import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('website quote offers per-store pickup, shows collection addresses, reprices and reserves without delivery vehicles', async () => {
  const { createServer } = await import('vite')
  const cacheDir = await mkdtemp(join(tmpdir(), 'checkout-pickup-test-'))
  const virtual = '\0virtual:checkout-pickup'
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: () => null, setItem() {}, removeItem() {},
  } })
  const server = await createServer({
    cacheDir, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [{
      name: 'checkout-pickup-state', enforce: 'pre',
      resolveId(id) { if (id === 'virtual:checkout-pickup') return virtual },
      load(id) {
        if (id !== virtual) return
        return `
          let cursor = 0, states = [], effects = [], cleanups = [], quote
          export const calls = []
          export function reset(value) { quote = value; states = []; calls.length = 0 }
          export function start() { cursor = 0; effects = [] }
          export function useState(initial) {
            const index = cursor++
            if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial
            return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value }]
          }
          export function useRef(initial) {
            const index = cursor++
            if (!(index in states)) states[index] = { current: initial }
            return states[index]
          }
          export const useCallback = callback => callback
          export const useEffect = effect => effects.push(effect)
          export function flushEffects() { for (const effect of effects) { const cleanup = effect(); if (typeof cleanup === 'function') cleanups.push(cleanup) } }
          export function cleanup() { for (const callback of cleanups) callback() }
          export const useParams = () => ({ id: 'quote' })
          export const useLocation = () => ({})
          export const useNavigate = () => () => {}
          export const Link = 'a'
          export const useDispatch = () => () => {}
          export const useSelector = selector => selector({ cart: { items: [] }, auth: { user: { _id: 'customer' } } })
          export const getSelectedDatabaseName = () => 'E_ShopUSA'
          export const apiRequest = async () => null
          export const availability = () => ({ methods: { cash: true, bank: true, card: true } })
          export const catalogPricing = () => ({ status: 'ready', enabled: false, reload: async () => ({ nearestStorePricingEnabled: false }) })
          export async function deliveryRequest(path, options) {
            calls.push([path, options])
            if (path === 'checkouts/quote') return quote
            if (path.startsWith('delivery-bank-accounts')) return []
            if (path === 'checkouts/quote/fulfillment') {
              quote = { ...quote, deliveries: quote.deliveries.map(delivery => {
                const method = options.data.selections.find(entry => entry.storeId === delivery.store._id).method
                return { ...delivery, fulfillmentMethod: method,
                  pickupAddress: method === 'pickup' ? { address: delivery.store.address } : undefined,
                  vehicle: method === 'pickup' ? undefined : 'car',
                  vehicleOptions: method === 'pickup' ? [] : [{ type: 'car', fee: 4 }],
                  deliveryFee: method === 'pickup' ? 0 : 4 }
              }) }
              quote.deliveryFee = quote.deliveries.reduce((sum, delivery) => sum + delivery.deliveryFee, 0)
              quote.totalPrice = 30 + quote.deliveryFee
              return quote
            }
            if (path === 'checkouts/quote/prepare') return { ...quote, status: 'awaiting_payment', paymentMethod: 'cash', paymentStatus: 'pending' }
            throw new Error('Unexpected request ' + path)
          }
        `
      },
      transform(code, id) {
        if (!id.endsWith('/DeliveryCheckoutPage.jsx')) return
        return code.replace("from 'react'", "from 'virtual:checkout-pickup'")
          .replace("from 'react-redux'", "from 'virtual:checkout-pickup'")
          .replace("from 'react-router-dom'", "from 'virtual:checkout-pickup'")
          .replace("from '../api/client'", "from 'virtual:checkout-pickup'")
          .replace("from '../api/delivery'", "from 'virtual:checkout-pickup'")
          .replace("import usePaymentAvailability from '../features/payment/usePaymentAvailability'",
            "import { availability as usePaymentAvailability } from 'virtual:checkout-pickup'")
          .replace("import useCatalogPricing from '../features/products/useCatalogPricing'",
            "import { catalogPricing as useCatalogPricing } from 'virtual:checkout-pickup'")
      },
    }],
  })
  let state
  try {
    state = await server.ssrLoadModule('virtual:checkout-pickup')
    const { default: Page } = await server.ssrLoadModule('/src/pages/DeliveryCheckoutPage.jsx')
    const address = { label: 'Home', address1: 'Customer street', city: 'Town', country: 'USA', phone: '123' }
    state.reset({ _id: 'quote', status: 'quote', kind: 'products', currency: 'usd', cart: [],
      expiresAt: new Date(Date.now() + 600000).toISOString(), itemsSubtotal: 30, deliveryFee: 8, totalPrice: 38,
      deliveries: ['A', 'B'].map(name => ({ key: name, store: { _id: name, name, address: name + ' collection street' },
        address, lines: [], cargo: {}, vehicle: 'car', distanceKm: 1, deliveryFee: 4, vehicleOptions: [{ type: 'car', fee: 4 }] })) })
    const nodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)]
    const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : text(node?.props?.children || [])
    const render = () => { state.start(); return Page().type() }
    render(); state.flushEffects()
    for (let index = 0; index < 10; index++) await new Promise(resolve => setImmediate(resolve))
    const button = label => nodes(render()).find(node => node.type === 'button' && text(node) === label)
    const selectStore = name => nodes(render()).find(node => node.type === 'label' && text(node).startsWith(name + ': fulfillment'))
      .props.children.find(node => node?.type === 'select')
    await selectStore('A').props.onChange({ target: { value: 'pickup' } })
    assert.deepEqual(state.calls.at(-1)[1].data.selections, [{ storeId: 'A', method: 'pickup' }, { storeId: 'B', method: 'delivery' }])
    assert.match(text(render()), /Customer collection address: A collection street/)
    assert.match(text(render()), /Estimated total:.*34\.00/)
    await selectStore('B').props.onChange({ target: { value: 'pickup' } })
    assert.match(text(render()), /Estimated total:.*30\.00/)
    assert.equal(nodes(render()).filter(node => node.type === 'label' && text(node).startsWith('Vehicle')).length, 0)
    assert.equal(button('Continue to payment').props.disabled, false)
    button('Continue to payment').props.onClick()
    nodes(render()).find(node => node.type === 'input' && node.props.value === 'cash').props.onChange()
    button('Review order').props.onClick()
    await button('Reserve stock & continue to payment').props.onClick()
    assert.deepEqual(state.calls.at(-1), ['checkouts/quote/prepare', { method: 'POST', timeoutMs: 60000,
      data: { method: 'cash', bankAccountId: '', selections: [] } }])
  } finally {
    state?.cleanup()
    await server.close()
    await rm(cacheDir, { recursive: true, force: true })
    if (storageDescriptor) Object.defineProperty(globalThis, 'localStorage', storageDescriptor)
    else delete globalThis.localStorage
  }
})
