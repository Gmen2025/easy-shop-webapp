import test from 'node:test'
import assert from 'node:assert/strict'
import { addressCountryCode, editAddress, placeAddress } from '../src/utils/addressAutocomplete.js'

const part = (type, longText) => ({ types: [type], longText })
const place = {
  id: 'grace-store',
  addressComponents: [
    part('street_number', '810'), part('route', 'West Grace Street'),
    part('locality', 'Chicago'), part('postal_code', '60613'), part('country', 'United States'),
  ],
  location: { lat: () => 41.95, lng: () => -87.65 },
}

test('place details fill address fields and GeoJSON coordinates in longitude-latitude order', () => {
  assert.deepEqual(placeAddress(place), {
    address1: '810 West Grace Street', city: 'Chicago', zip: '60613', country: 'United States',
    placeId: 'grace-store', location: { type: 'Point', coordinates: [-87.65, 41.95] },
  })
})

test('landmarks and Ethiopian addresses work without street numbers or postal codes', () => {
  const result = placeAddress({ ...place, formattedAddress: 'Bole landmark, Addis Ababa',
    addressComponents: [part('administrative_area_level_1', 'Addis Ababa'), part('country', 'Ethiopia')] })
  assert.equal(result.address1, 'Bole landmark, Addis Ababa')
  assert.equal(result.city, 'Addis Ababa')
  assert.equal(result.zip, '')
  assert.throws(() => placeAddress({ ...place, location: null }), /no map coordinates/)
})

test('regional suggestions follow recipient country, including international deliveries', () => {
  for (const country of ['USA', 'us', 'United States', 'United States of America']) assert.equal(addressCountryCode(country), 'us')
  for (const country of ['Ethiopia', 'ET', 'ethio']) assert.equal(addressCountryCode(country), 'et')
  assert.equal(addressCountryCode('Canada'), undefined)
})

test('manual address edits remove stale place and GPS metadata but retain contact fields', () => {
  const address = { ...placeAddress(place), phone: '123', address2: 'Unit 2', label: 'Home', latitude: 41.95, longitude: -87.65 }
  for (const field of ['address1', 'address2', 'city', 'zip', 'country']) {
    const edited = editAddress(address, field, 'changed')
    assert.equal(edited[field], 'changed')
    for (const key of ['placeId', 'location', 'latitude', 'longitude']) assert.equal(key in edited, false)
    assert.equal(edited.phone, '123')
  }
  assert.equal(editAddress(address, 'phone', '456').placeId, 'grace-store')
  assert.equal(address.placeId, 'grace-store')
})
