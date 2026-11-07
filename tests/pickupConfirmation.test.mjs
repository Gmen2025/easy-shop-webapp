import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('collection displays its address, waits for Ethiopia arrival, reports errors and sends one role-specific handover confirmation', async () => {
  const { createServer } = await import('vite')
  const cacheDir = await mkdtemp(join(tmpdir(), 'pickup-confirmation-test-'))
  const virtual = '\0virtual:pickup-state'
  const server = await createServer({
    cacheDir, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [{
      name: 'pickup-test-state', enforce: 'pre',
      resolveId(id) { if (id === 'virtual:pickup-state') return virtual },
      load(id) {
        if (id !== virtual) return
        return `
          let cursor = 0, states = []
          export const calls = []
          export let failure = ''
          export function reset() { cursor = 0; states = []; calls.length = 0; failure = '' }
          export function fail(message) { failure = message }
          export function start() { cursor = 0 }
          export function useState(initial) {
            const index = cursor++
            if (!(index in states)) states[index] = initial
            return [states[index], value => { states[index] = value }]
          }
          export function useRef(initial) {
            const index = cursor++
            if (!(index in states)) states[index] = { current: initial }
            return states[index]
          }
          export async function deliveryRequest(...args) { calls.push(args); if (failure) throw new Error(failure) }
        `
      },
      transform(code, id) {
        if (!id.endsWith('/PickupConfirmation.jsx')) return
        return code.replace("from 'react'", "from 'virtual:pickup-state'")
          .replace("from '../api/delivery'", "from 'virtual:pickup-state'")
      },
    }],
  })
  try {
    const state = await server.ssrLoadModule('virtual:pickup-state')
    const { default: Component } = await server.ssrLoadModule('/src/components/PickupConfirmation.jsx')
    const nodes = (node) => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)]
    const text = (node) => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : text(node?.props?.children || [])
    const order = { _id: 'order', checkoutGroup: 'checkout', fulfillmentMethod: 'pickup', fulfillmentStatus: 'pending',
      pickupAddress: { name: 'Market', address: 'Store collection street' } }
    for (const party of ['customer', 'operator']) {
      state.reset()
      let reloads = 0
      const render = () => { state.start(); return Component({ order, party, onSaved: async () => { reloads++ } }) }
      assert.match(text(render()), /Store collection street/)
      assert.match(text(render()), /Both parties must confirm/)
      assert.equal(nodes(render()).find((node) => node.type === 'button').props.disabled, true)
      nodes(render()).find((node) => node.type === 'input').props.onChange({ target: { value: '  Handover 123  ' } })
      state.fail('Payment must be verified')
      await nodes(render()).find((node) => node.type === 'button').props.onClick()
      assert.match(text(render()), /Payment must be verified/)
      assert.equal(reloads, 0)
      state.fail('')
      const button = nodes(render()).find((node) => node.type === 'button')
      await Promise.all([button.props.onClick(), button.props.onClick()])
      assert.equal(state.calls.length, 2, 'One failed request and one successful request, not duplicate taps')
      assert.deepEqual(state.calls.at(-1), ['checkouts/checkout/orders/order/pickup-confirmation', { method: 'POST', data: { party, note: 'Handover 123' } }])
      assert.equal(reloads, 1)
      order.pickupConfirmation = { [party === 'customer' ? 'customerAt' : 'operatorAt']: new Date().toISOString() }
      assert.equal(nodes(render()).find((node) => node.type === 'button'), undefined)
      order.pickupConfirmation = undefined
    }
    order.internationalShipping = { status: 'shipped' }
    state.reset(); state.start()
    let tree = Component({ order, onSaved() {} })
    assert.match(text(tree), /Awaiting arrival in Ethiopia/)
    assert.equal(nodes(tree).find((node) => node.type === 'button'), undefined)
    order.internationalShipping.status = 'arrived_ethiopia'
    state.start(); tree = Component({ order, onSaved() {} })
    assert.ok(nodes(tree).find((node) => node.type === 'button'))
  } finally {
    await server.close()
    await rm(cacheDir, { recursive: true, force: true })
  }
})
