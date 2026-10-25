import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildDriverConfigPayload, buildRideConfigPayload, buildTerminationReviewPayload,
  normalizeRideConfig, normalizeRideDrivers, normalizeRidePayments,
} from '../src/utils/rideSettings.js'

const config = () => ({
  enabled: true,
  sharedDiscountPercent: '15',
  maxPickupMinutes: '12',
  maxDetourMinutes: '20',
  driverRadiusKm: '30',
  vehicleRates: {
    economy: { enabled: true, baseFare: '10', distanceRate: '2.5', minuteRate: '0.5' },
    comfort: { enabled: false, baseFare: '', distanceRate: '', minuteRate: '' },
    van: { enabled: false, baseFare: '', distanceRate: '', minuteRate: '' },
  },
})

const ride = () => ({
  _id: 'ride-1',
  user: 'user-1',
  status: 'terminated',
  paymentStatus: 'review_required',
  paymentMethod: 'bank',
  currency: 'etb',
  estimate: 350,
  stops: [
    { type: 'pickup', address: { address1: 'Bole Road', city: 'Addis Ababa', country: 'Ethiopia' } },
    { type: 'dropoff', address: { address1: 'Airport Road', city: 'Addis Ababa', country: 'Ethiopia' } },
  ],
})

test('normalizes an unconfigured ride region without inventing successful defaults', () => {
  const normalized = normalizeRideConfig({ enabled: false })
  assert.equal(normalized.enabled, false)
  assert.equal(normalized.sharedDiscountPercent, '')
  assert.deepEqual(normalized.vehicleRates.economy, {
    enabled: false, baseFare: '', distanceRate: '', minuteRate: '',
  })
  assert.throws(() => buildRideConfigPayload(normalized), /Shared discount/)
})

test('rejects malformed ride configuration response types', () => {
  assert.throws(() => normalizeRideConfig({ enabled: 'false' }), /invalid ride configuration/)
  assert.throws(() => normalizeRideConfig({ enabled: false, driverRadiusKm: null }), /valid number/)
  assert.throws(() => normalizeRideConfig({
    enabled: false, vehicleRates: { economy: { enabled: 'false' } },
  }), /invalid economy pricing/)
})

test('builds the exact validated ride configuration payload', () => {
  assert.deepEqual(buildRideConfigPayload(config()), {
    enabled: true,
    sharedDiscountPercent: 15,
    maxPickupMinutes: 12,
    maxDetourMinutes: 20,
    driverRadiusKm: 30,
    vehicleRates: {
      economy: { enabled: true, baseFare: 10, distanceRate: 2.5, minuteRate: 0.5 },
      comfort: { enabled: false },
      van: { enabled: false },
    },
  })
})

test('rejects invalid ranges, precision and enabled options without prices', () => {
  const noRates = config()
  noRates.enabled = false
  noRates.vehicleRates.economy.enabled = false
  assert.throws(() => buildRideConfigPayload({ ...noRates, enabled: true }), /at least one passenger vehicle option/)
  assert.throws(() => buildRideConfigPayload({ ...config(), maxPickupMinutes: '0' }), /greater than 0/)
  assert.throws(() => buildRideConfigPayload({
    ...config(), vehicleRates: { ...config().vehicleRates, economy: { ...config().vehicleRates.economy, minuteRate: '0.001' } },
  }), /at most two decimal places/)
  assert.throws(() => buildRideConfigPayload({
    ...config(), vehicleRates: { ...config().vehicleRates, economy: { enabled: true, baseFare: 0, distanceRate: 0, minuteRate: 0 } },
  }), /nonzero fare/)
})

test('validates company drivers and builds the backend vehicle payload', () => {
  const drivers = normalizeRideDrivers([{
    _id: 'driver-1', name: 'Driver One', vehicleType: 'car', carClass: 'comfort',
    passengerSeats: 4, serviceModes: { delivery: true, regular: true, shared: false },
    sharedIntakeOpen: true, activeRideTrip: null,
  }])
  assert.equal(drivers[0].name, 'Driver One')
  assert.deepEqual(buildDriverConfigPayload({
    vehicleType: 'car', carClass: 'comfort', passengerSeats: '4',
  }), { vehicleType: 'car', carClass: 'comfort', passengerSeats: 4 })
  assert.deepEqual(buildDriverConfigPayload({
    vehicleType: 'truck', carClass: '', passengerSeats: '',
  }), { vehicleType: 'truck', carClass: '', passengerSeats: 0 })
  assert.throws(() => normalizeRideDrivers([{ _id: 'driver-1', name: 'Driver', serviceModes: { shared: 'yes' } }]), /invalid service modes/)
  assert.throws(() => buildDriverConfigPayload({
    vehicleType: 'van', carClass: '', passengerSeats: '17',
  }), /1-16 usable passenger seats/)
  assert.throws(() => buildDriverConfigPayload({
    vehicleType: 'van', carClass: 'economy', passengerSeats: '4',
  }), /only be assigned to cars/)
})

test('validates completed ride/payment records and termination review payloads', () => {
  assert.equal(normalizeRidePayments([ride()])[0].paymentStatus, 'review_required')
  assert.deepEqual(buildTerminationReviewPayload({ fare: '125.50', note: '  Reviewed  ' }), {
    fare: 125.5, note: 'Reviewed',
  })
  assert.deepEqual(buildTerminationReviewPayload({ fare: '', note: 'No fare due' }, true), {
    fare: 0, note: 'No fare due',
  })
  assert.throws(() => normalizeRidePayments([{ ...ride(), currency: 'cad' }]), /invalid completed-ride/)
  assert.throws(() => normalizeRidePayments([{ ...ride(), stops: [] }]), /invalid completed-ride/)
  assert.throws(() => buildTerminationReviewPayload({ fare: '1.001', note: 'Reviewed' }), /at most two decimal places/)
  assert.throws(() => buildTerminationReviewPayload({ fare: '2', note: ' ' }), /review note/)
})
