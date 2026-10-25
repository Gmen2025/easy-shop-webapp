import test from 'node:test'
import assert from 'node:assert/strict'
import {
  balanceRideStops, buildRidePayload, editRideAddress, newRideStop,
  rideDirectionsUrl, validateRideQuotes,
} from '../src/utils/rides.js'

const address = (label = 'Home', country = 'Ethiopia') => ({
  label, address1: 'Bole Road', address2: '', city: 'Addis Ababa', zip: '', country, phone: '0911000000',
})
const stop = (type, passengers = '1') => ({ ...newRideStop(type, 'Ethiopia'), passengers, address: address(type) })
const priced = () => ({
  _id: 'quote-1', vehicleOption: 'economy', estimate: 200, currency: 'etb', seats: 1,
  baseline: { minutes: 10, distanceKm: 4 }, expiresAt: '2026-10-25T15:00:00Z',
})

test('ride defaults include the required backend delivery label and independent stop IDs', () => {
  const pickup = newRideStop('pickup', 'USA')
  const dropoff = newRideStop('dropoff', 'USA')
  assert.equal(pickup.address.label, 'Pickup')
  assert.equal(dropoff.address.label, 'Drop-off')
  assert.equal(pickup.address.country, 'USA')
  assert.notEqual(pickup.id, dropoff.id)
})

test('ride payload preserves saved labels and contacts and sends numeric passenger counts', () => {
  const pickup = stop('pickup', '2')
  pickup.address = { ...address('Work'), _id: 'saved-work' }
  const payload = buildRidePayload('regular', [pickup, stop('dropoff', '2')], 'Ethiopia')
  assert.equal(payload.stops[0].address.label, 'Work')
  assert.equal(payload.stops[0].address._id, 'saved-work')
  assert.equal(payload.stops[0].address.phone, '0911000000')
  assert.equal(payload.stops[0].passengers, 2)
  assert.equal('id' in payload.stops[0], false)
})

test('final drop-off balances after boarding, leaving, reordering or removing stops', () => {
  const stops = [stop('pickup', '3'), stop('dropoff', '1'), stop('pickup', '2'), stop('dropoff')]
  assert.equal(balanceRideStops(stops).at(-1).passengers, '4')
  assert.equal(balanceRideStops(stops.filter((_, index) => index !== 2)).at(-1).passengers, '2')
  assert.equal(balanceRideStops([stop('pickup', ''), stop('dropoff')]).at(-1).passengers, '')
  assert.equal(balanceRideStops([stop('pickup', 'invalid'), stop('dropoff')]).at(-1).passengers, '')
  assert.equal(balanceRideStops(stops)[0].type, 'pickup')
})

test('validates exact passenger constraints, shared mode and stop count limits', () => {
  assert.equal(buildRidePayload('shared', [stop('pickup'), stop('dropoff')], 'Ethiopia').mode, 'shared')
  assert.throws(() => buildRidePayload('shared', [stop('pickup'), stop('pickup'), stop('dropoff', '2')], 'Ethiopia'), /one pickup/)
  for (const count of ['0', '-1', '1.5', '17', '', 'invalid']) {
    assert.throws(() => buildRidePayload('regular', [stop('pickup', count), stop('dropoff', count)], 'Ethiopia'), /1-16 passengers/)
  }
  assert.throws(() => buildRidePayload('regular', [stop('pickup'), stop('dropoff', '2')], 'Ethiopia'), /before dropping/)
  assert.throws(() => buildRidePayload('regular', [stop('pickup', '2'), stop('dropoff')], 'Ethiopia'), /account for every passenger/)
  const twelve = [stop('pickup'), ...Array.from({ length: 5 }, () => [stop('pickup'), stop('dropoff')]).flat(), stop('dropoff')]
  assert.equal(buildRidePayload('regular', twelve, 'Ethiopia').stops.length, 12)
  assert.throws(() => buildRidePayload('regular', [...twelve, stop('dropoff')], 'Ethiopia'), /2-12/)
})

test('rejects missing labels, contacts, wrong-region addresses and missing USA ZIP', () => {
  for (const field of ['label', 'address1', 'city', 'phone']) {
    const pickup = stop('pickup')
    pickup.address[field] = ''
    assert.throws(() => buildRidePayload('regular', [pickup, stop('dropoff')], 'Ethiopia'), /required/)
  }
  assert.throws(() => buildRidePayload('regular', [stop('pickup'), stop('dropoff')], 'USA'), /choose an address in USA/)
  const usa = [stop('pickup'), stop('dropoff')].map((entry) => ({ ...entry, address: address(entry.type, 'USA') }))
  assert.throws(() => buildRidePayload('regular', usa, 'USA'), /Postal code/)
  usa.forEach((entry) => { entry.address.zip = '60613' })
  assert.equal(buildRidePayload('regular', usa, 'USA').stops.length, 2)
})

test('location edits detach saved identity and clear stale GPS/place metadata; labels/contact edits do not', () => {
  const original = {
    ...address(), _id: 'home', placeId: 'place-home', location: { coordinates: [38.75, 9.03] },
    formattedAddress: 'Old location', currentLocation: { latitude: 9.03, longitude: 38.75 },
  }
  for (const field of ['address1', 'address2', 'city', 'zip', 'country']) {
    const next = editRideAddress(original, field, 'changed')
    for (const key of ['_id', 'placeId', 'location', 'currentLocation', 'formattedAddress']) assert.equal(key in next, false)
  }
  for (const field of ['label', 'phone']) {
    const next = editRideAddress(original, field, 'changed')
    assert.equal(next._id, 'home')
    assert.equal(next.placeId, 'place-home')
    assert.deepEqual(next.currentLocation, original.currentLocation)
  }
  assert.equal(original.address1, 'Bole Road')
})

test('requires complete finite priced quote response rather than success-shaped invalid data', () => {
  assert.equal(validateRideQuotes({ quotes: [priced()] }).length, 1)
  for (const changes of [
    { _id: '' }, { estimate: 0 }, { estimate: NaN }, { currency: 'eur' }, { seats: 0 },
    { seats: 17 }, { vehicleOption: 'truck' }, { expiresAt: 'bad-date' },
    { baseline: { minutes: -1, distanceKm: 2 } }, { baseline: { minutes: 10 } },
  ]) assert.throws(() => validateRideQuotes({ quotes: [{ ...priced(), ...changes }] }), /No valid priced/)
  assert.throws(() => validateRideQuotes({ quotes: [] }), /No valid priced/)
})

test('external ride navigation includes every intermediate stop in booking order', () => {
  const stops = [stop('pickup'), stop('pickup'), stop('dropoff', '2')]
  stops.forEach((entry, index) => { entry.address.location = { coordinates: [[38.7, 38.71, 38.72][index], 9] } })
  const url = new URL(rideDirectionsUrl(stops))
  assert.equal(url.searchParams.get('origin'), '9,38.7')
  assert.equal(url.searchParams.get('waypoints'), '9,38.71')
  assert.equal(url.searchParams.get('destination'), '9,38.72')
  assert.equal(rideDirectionsUrl([stop('pickup')]), null)
  assert.equal(rideDirectionsUrl([newRideStop('pickup', 'Ethiopia'), newRideStop('dropoff', 'Ethiopia')]), null)
  assert.match(rideDirectionsUrl([stop('pickup'), stop('dropoff')]), /Bole/)
})
