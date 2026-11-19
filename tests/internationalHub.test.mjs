import test from 'node:test'
import assert from 'node:assert/strict'
import { allowedInternationalChargeMethods, buildInternationalChargesPayload, formatInternationalChargeAmount, internationalChargeLabel, internationalHubSteps, internationalStageLabel } from '../src/utils/internationalHub.js'

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
