import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { allowedInternationalChargeMethods, buildInternationalChargesPayload, formatInternationalChargeAmount, internationalChargeLabel, internationalDriverRoute, internationalHubSteps, internationalStageLabel } from '../src/utils/internationalHub.js'

test('international driver screen shows the current live leg and stage-specific confirmations', async () => {
  const { createServer } = await import('vite')
  const { createElement } = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const hooksId = '\0virtual:international-driver-hooks'
  const cacheDir = await mkdtemp(join(tmpdir(), 'international-driver-test-'))
  const server = await createServer({
    configFile: false, cacheDir, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [(await import('@vitejs/plugin-react')).default(), {
      name: 'international-driver-fixture', enforce: 'pre',
      resolveId(id) { if (id === 'virtual:international-driver-hooks') return hooksId },
      load(id) {
        if (id !== hooksId) return
        return `import * as React from 'react'
          export const { useCallback, useEffect, useRef } = React
          let values = {}, index = 0
          export function reset(next) { values = next; index = 0 }
          export function useState(initial) { const i = index++; return React.useState(i in values ? values[i] : initial) }`
      },
      transform(code, id) {
        if (id.endsWith('/InternationalDriverDeliveries.jsx')) return code.replace("from 'react'", "from 'virtual:international-driver-hooks'")
      },
    }],
  })
  try {
    const { reset } = await server.ssrLoadModule('virtual:international-driver-hooks')
    const { default: Screen } = await server.ssrLoadModule('/src/components/InternationalDriverDeliveries.jsx')
    const shipment = { groupId: 'group', shipmentId: 'home', trackingCode: 'AG-TEST', pickupFrom: { address: 'Hub' },
      recipient: { address1: 'Home' }, destinationCountry: 'Ethiopia', actions: ['pickup'] }
    const gps = { sharing: true, point: { latitude: 9, longitude: 38 }, latest: { current: null }, status: 'GPS active', toggle() {} }
    const route = { key: 'group:home', stage: 'pickup', destination: { latitude: 9.1, longitude: 38.1 },
      coordinates: [{ latitude: 9, longitude: 38 }, { latitude: 9.1, longitude: 38.1 }], distance: 4, duration: 10 }
    const render = () => {
      reset({ 0: [shipment], 4: 'group:home', 5: route })
      return renderToStaticMarkup(createElement(Screen, { gps }))
    }
    let markup = render()
    assert.match(markup, /Hub pickup driving route/)
    assert.match(markup, /4\.00 km \| 10 minutes/)
    assert.match(markup, /Confirm picked up from hub/)
    shipment.actions = ['deliver']
    markup = render()
    assert.match(markup, /Recipient delivery driving route/)
    assert.doesNotMatch(markup, /4\.00 km \| 10 minutes/, 'previous pickup leg must not be shown after pickup')
    assert.match(markup, /Delivery proof/)
    route.stage = 'delivery'
    assert.match(render(), /4\.00 km \| 10 minutes/)
    gps.sharing = false
    assert.match(render(), /Enable live GPS and wait for a fresh location/)
  } finally { await server.close(); await rm(cacheDir, { recursive: true, force: true }) }
})

test('international driver route uses hub pickup and recipient pin or address, and requires both endpoints', () => {
  const shipment = { pickupFrom: { address: 'Bole hub' }, destinationCountry: 'Ethiopia',
    recipient: { address1: 'Main St', city: 'Addis', location: { coordinates: [38.8, 8.98] } } }
  assert.match(internationalDriverRoute(shipment).url, /origin=Bole%20hub%2C%20Ethiopia&destination=8.98%2C38.8&travelmode=driving/)
  shipment.recipient.location = null
  assert.match(internationalDriverRoute(shipment).url, /destination=Main%20St%2C%20Addis%2C%20Ethiopia/)
  shipment.pickupFrom.address = ''
  assert.equal(internationalDriverRoute(shipment).url, '')
  shipment.pickupFrom.address = 'Hub'
  shipment.recipient.address1 = ''
  assert.equal(internationalDriverRoute(shipment).url, '')
})

test('international customs payment methods are currency-specific', () => {
  assert.deepEqual(allowedInternationalChargeMethods('ETB'), ['bank', 'telebirr'])
  assert.deepEqual(allowedInternationalChargeMethods('usd'), ['bank', 'card'])
  assert.deepEqual(allowedInternationalChargeMethods('eur'), [])
})

test('charge formatting and status labels remain readable', () => {
  assert.match(formatInternationalChargeAmount(1200.5, 'etb'), /1,200\.50/)
  assert.equal(formatInternationalChargeAmount(2, 'invalid'), 'Unavailable')
  assert.equal(internationalStageLabel('in_customs'), 'At customs')
  assert.equal(internationalStageLabel('awaiting_collection'), 'Awaiting collection')
  assert.equal(internationalChargeLabel('other', 'Extra paperwork'), 'Extra paperwork')
  assert.equal(internationalChargeLabel('tax'), 'Import tax / VAT')
})

test('hub charge payload omits blank rows and supports waivers with an empty list', () => {
  assert.deepEqual(buildInternationalChargesPayload([
    { type: 'customs_duty', amount: '12.30' }, { type: 'other', amount: '' },
    { type: 'other', amount: '4', label: 'Inspection' },
  ], 'Verified at customs'), {
    charges: [{ type: 'customs_duty', amount: 12.3 }, { type: 'other', amount: 4, label: 'Inspection' }],
    note: 'Verified at customs',
  })
  assert.deepEqual(buildInternationalChargesPayload([]), { charges: [] })
  assert.deepEqual(buildInternationalChargesPayload([{ type: 'tax', amount: '0.29' }]), { charges: [{ type: 'tax', amount: 0.29 }] })
  assert.throws(() => buildInternationalChargesPayload([{ type: 'other', amount: '2' }]), /Describe/)
  assert.throws(() => buildInternationalChargesPayload([{ type: 'tax', amount: '1.001' }]), /two decimal/)
  assert.throws(() => buildInternationalChargesPayload(Array.from({ length: 13 }, () => ({ type: 'tax', amount: '1' }))), /12/)
})

test('hub steps surface the current step and waiting hints for every shipment state', () => {
  const byKey = (steps) => Object.fromEntries(steps.map((step) => [step.key, step]))
  const shipped = byKey(internationalHubSteps({ status: 'shipped', destination: { stage: 'in_transit' }, packages: [] }))
  assert.equal(shipped.arrive.state, 'current')
  const legacy = byKey(internationalHubSteps({ status: 'arrived_ethiopia', destination: null, packages: [] }))
  assert.equal(legacy.arrive.state, 'current')
  assert.match(legacy.arrive.hint, /start hub processing/)
  const partial = byKey(internationalHubSteps({ status: 'arrived_ethiopia',
    destination: { stage: 'in_customs', charges: { status: 'paid' } },
    packages: [{ customsCollected: true }, { customsCollected: false }, { cancelled: true }] }))
  assert.equal(partial.clear.state, 'current')
  assert.equal(partial.clear.hint, '1 of 2 active packages collected.')
  assert.equal(partial.ready.state, 'pending')
  const unpaid = byKey(internationalHubSteps({ status: 'arrived_ethiopia',
    destination: { stage: 'cleared', charges: { status: 'awaiting_payment' } }, packages: [] }))
  assert.deepEqual([unpaid.charges.state, unpaid.ready.state], ['done', 'current'])
  assert.match(unpaid.ready.hint, /customer to pay/)
  const dispatched = byKey(internationalHubSteps({ status: 'arrived_ethiopia',
    destination: { stage: 'dispatched', charges: { status: 'paid' }, driver: { name: 'Abebe' } }, packages: [] }))
  assert.match(dispatched.complete.hint, /driver to pick up/)
  const delivered = byKey(internationalHubSteps({ status: 'delivered',
    destination: { stage: 'delivered', charges: { status: 'waived' } }, packages: [] }))
  assert.ok(Object.values(delivered).every((step) => step.state !== 'current'))
})

test('unpaid international charges surface only shipments awaiting payment or bank review', async () => {
  const { internationalUnpaidCharges } = await import('../src/utils/internationalHub.js')
  const group = { international: { shipments: [
    { destination: { charges: { status: 'awaiting_payment', total: 150.25, currency: 'etb' } } },
    { destination: { charges: { status: 'bank_review', total: 10, currency: 'etb' } } },
    { destination: { charges: { status: 'paid', total: 5, currency: 'etb' } } },
    { destination: null },
  ] } }
  assert.deepEqual(internationalUnpaidCharges(group).map((charges) => charges.status), ['awaiting_payment', 'bank_review'])
  assert.deepEqual(internationalUnpaidCharges(null), [])
  assert.deepEqual(internationalUnpaidCharges({ international: null }), [])
})
