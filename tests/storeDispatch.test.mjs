import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('website stores prepare, select and dispatch packages through the shared authenticated APIs', async () => {
  const { createServer } = await import('vite')
  const cacheDir = await mkdtemp(join(tmpdir(), 'store-dispatch-test-'))
  const stateId = '\0virtual:store-dispatch-state'
  const server = await createServer({
    cacheDir, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [{
      name: 'store-dispatch-state', enforce: 'pre',
      resolveId(id) { if (id === 'virtual:store-dispatch-state') return stateId },
      load(id) {
        if (id !== stateId) return
        return `
          let cursor = 0, states = [], orders = [], requestError = null
          export const calls = []
          export const resources = []
          export function reset(value) { orders = value; states = []; calls.length = 0; resources.length = 0; requestError = null }
          export function failRequest(message) { requestError = new Error(message) }
          export function renderStart() { cursor = 0 }
          export function useState(initial) {
            const index = cursor++
            if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial
            return [states[index], (value) => { states[index] = typeof value === 'function' ? value(states[index]) : value }]
          }
          export const useEffect = () => {}
          export const useCompanyResource = (path) => { resources.push(path); return { data: orders, loading: false, reload: async () => {} } }
          export const useCompanyAction = () => ({ busy: false, run: async (action) => action() })
          export const deliveryRequest = async (...args) => { calls.push(args); if (requestError) throw requestError }
          export const apiRequest = async (...args) => { calls.push(args) }
        `
      },
      transform(code, id) {
        if (!id.endsWith('/StoreAssignmentsPage.jsx')) return
        return code.replace("from 'react'", "from 'virtual:store-dispatch-state'")
          .replace("from '../api/delivery'", "from 'virtual:store-dispatch-state'")
          .replace("from '../api/client'", "from 'virtual:store-dispatch-state'")
          .replace("import useCompanyResource, { useCompanyAction } from '../features/company/useCompanyResource'",
            "import { useCompanyResource, useCompanyAction } from 'virtual:store-dispatch-state'")
      },
    }],
  })
  try {
    const state = await server.ssrLoadModule('virtual:store-dispatch-state')
    const { default: Page } = await server.ssrLoadModule('/src/pages/StoreAssignmentsPage.jsx')
    const order = { _id: 'order123456', storeRouteVersion: 1, fulfillmentStatus: 'unassigned', store: null,
      fallbackStore: { _id: 'store1', name: 'Store' },
      assignedStoreSnapshot: { name: 'Store', storeId: 'store1' }, orderItems: [], deliveryStatus: 'Pending' }
    state.reset([order])
    const nodes = (node) => !node || typeof node !== 'object' ? [] : Array.isArray(node)
      ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)]
    const text = (node) => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node)
      ? node.map(text).join('') : text(node?.props?.children || [])
    let admin = false
    const render = () => { state.renderStart(); return Page({ admin }) }
    const button = (label) => nodes(render()).find((node) => node.type === 'button' && text(node) === label)
    assert.equal(button('Dispatch selected (0)').props.disabled, true)
    assert.equal(state.resources.at(-1), '/stores/me/assignments')
    await button('Claim order').props.onClick()
    assert.deepEqual(state.calls[0], ['me/assignments/order123456/accept', { method: 'POST' }])
    order.fulfillmentStatus = 'accepted'
    order.store = 'store1'
    order.fallbackStore = null
    assert.equal(button('Dispatch selected (0)').props.disabled, true)
    assert.match(text(render()), /Claimed - prepare the package/)
    await button('Mark package ready').props.onClick()
    assert.deepEqual(state.calls[1], ['me/assignments/order123456/ready', { method: 'POST' }])
    order.storeReadyAt = new Date().toISOString()
    const checkbox = nodes(render()).find((node) => node.type === 'input' && node.props.type === 'checkbox')
    assert.equal(checkbox.props.checked, true)
    assert.equal(button('Dispatch selected (1)').props.disabled, false)
    checkbox.props.onChange()
    assert.equal(button('Dispatch selected (0)').props.disabled, true)
    nodes(render()).find((node) => node.type === 'input' && node.props.type === 'checkbox').props.onChange()
    assert.equal(button('Dispatch selected (1)').props.disabled, false)
    await button('Dispatch selected (1)').props.onClick()
    assert.deepEqual(state.calls[2], ['me/dispatch-batches', { method: 'POST', data: { orderIds: [order._id] } }])
    order.storeDispatchBatch = 'batch1'
    assert.match(text(render()), /Dispatched batch: batch1/)
    assert.equal(nodes(render()).filter((node) => node.type === 'input' && node.props.type === 'checkbox').length, 0)
    admin = true
    order.storeDispatchBatch = null
    order.storeReadyAt = null
    order.fulfillmentStatus = 'unassigned'
    order.adminReviewRequired = 'store'
    state.reset([order])
    assert.match(text(render()), /Rejected - Admin review/)
    assert.equal(state.resources.at(-1), '/stores/admin/assignments')
    await button('Claim for assigned/default store').props.onClick()
    assert.deepEqual(state.calls[0], ['admin/assignments/order123456/accept', { method: 'POST' }])
    await button('Admin reroute').props.onClick()
    assert.deepEqual(state.calls[1], ['admin/assignments/order123456/reroute', { method: 'POST' }])
    order.fulfillmentStatus = 'accepted'
    order.adminReviewRequired = undefined
    await button('Mark package ready').props.onClick()
    assert.deepEqual(state.calls[2], ['admin/assignments/order123456/ready', { method: 'POST' }])
    order.storeReadyAt = new Date().toISOString()
    assert.equal(nodes(render()).find((node) => node.type === 'input' && node.props.type === 'checkbox').props.checked, true)
    assert.equal(button('Dispatch selected (1)').props.disabled, false)
    await button('Dispatch selected (1)').props.onClick()
    assert.deepEqual(state.calls[3], ['admin/dispatch-batches', { method: 'POST', data: { orderIds: [order._id] } }])
    order.storeDispatchBatch = 'batch1'
    order.companyDriverResponses = [{ driver: 'driver1', status: 'rejected', action: 'reject' }]
    assert.match(text(render()), /Driver rejection - Admin review/)
    const originalWindow = globalThis.window
    try {
      globalThis.window = { confirm: () => true }
      button('Reroute to another driver').props.onClick()
      assert.deepEqual(state.calls[4], ['admin/assignments/order123456/drivers/reroute', { method: 'POST' }])
      const input = nodes(render()).find((node) => node.type === 'input' && node.props['aria-label'] === 'Driver ID for order123456')
      input.props.onChange({ target: { value: '  driver2  ' } })
      button('Admin assign / dispatch to driver').props.onClick()
      assert.deepEqual(state.calls[5], ['admin/assignments/order123456/drivers/assign', { method: 'POST', data: { driverId: 'driver2' } }])
      admin = false
      assert.equal(button('Admin assign / dispatch to driver'), undefined)
      button('Reroute to another driver').props.onClick()
      assert.deepEqual(state.calls[6], ['me/assignments/order123456/drivers/reroute', { method: 'POST' }])
      admin = true
      order.deliveryStatus = 'Picked Up'
      assert.equal(button('Reroute to another driver'), undefined)
      order.deliveryStatus = 'Pending'
    } finally {
      if (originalWindow === undefined) delete globalThis.window
      else globalThis.window = originalWindow
    }
    order.fulfillmentStatus = 'unassigned'
    order.adminReviewRequired = 'store'
    try {
      globalThis.window = { confirm: () => false }
      button('Delete rejected order').props.onClick()
      assert.equal(state.calls.length, 7)
      globalThis.window.confirm = () => true
      button('Delete rejected order').props.onClick()
      assert.deepEqual(state.calls[7], ['/orders/order123456', { method: 'DELETE' }])
    } finally {
      if (originalWindow === undefined) delete globalThis.window
      else globalThis.window = originalWindow
    }
    for (const mode of [false, true]) {
      admin = mode
      order.fulfillmentStatus = 'accepted'
      order.adminReviewRequired = undefined
      order.storeDispatchBatch = null
      order.storeReadyAt = null
      state.reset([order])
      state.failRequest('Package changed. Refresh assignments.')
      await assert.rejects(button('Mark package ready').props.onClick(), /Package changed/)
      assert.equal(button('Dispatch selected (0)').props.disabled, true)
      assert.equal(nodes(render()).filter((node) => node.type === 'input' && node.props.type === 'checkbox').length, 0)
    }
    for (const mode of [false, true]) {
      admin = mode
      order.storeRouteVersion = undefined
      order.requiredVehicle = undefined
      state.reset([order])
      assert.equal(button('Mark package ready'), undefined)
      assert.match(text(render()), /older delivery workflow/)
      assert.equal(button('Enable store preparation').props.disabled, true)
      nodes(render()).find((node) => node.type === 'select').props.onChange({ target: { value: 'car' } })
      assert.equal(button('Enable store preparation').props.disabled, false)
      try {
        globalThis.window = { confirm: () => false }
        button('Enable store preparation').props.onClick()
        assert.equal(state.calls.length, 0)
        globalThis.window.confirm = () => true
        button('Enable store preparation').props.onClick()
        assert.deepEqual(state.calls[0], [`${mode ? 'admin' : 'me'}/assignments/order123456/enable-preparation`,
          { method: 'POST', data: { vehicle: 'car' } }])
        await new Promise((resolve) => setTimeout(resolve, 0))
        order.storeRouteVersion = 1
        order.requiredVehicle = 'car'
        assert.ok(button('Mark package ready'))
        assert.equal(button('Dispatch selected (0)').props.disabled, true)
        await button('Mark package ready').props.onClick()
        order.storeReadyAt = new Date().toISOString()
        assert.equal(button('Dispatch selected (1)').props.disabled, false)
        order.storeReadyAt = null
      } finally {
        if (originalWindow === undefined) delete globalThis.window
        else globalThis.window = originalWindow
      }
    }
  } finally {
    await server.close()
    await rm(cacheDir, { recursive: true, force: true })
  }
})
