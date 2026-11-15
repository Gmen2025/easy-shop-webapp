import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

test('delivery search sits above manual fields, fills only the chosen drop-off and keeps searches separate', async () => {
  const { createServer } = await import('vite')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const cacheDir = await mkdtemp(join(tmpdir(), 'delivery-address-fields-'))
  const virtual = '\0virtual:delivery-address-state'
  const server = await createServer({
    cacheDir, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [{
      name: 'delivery-address-state', enforce: 'pre',
      resolveId(id) { if (id === 'virtual:delivery-address-state') return virtual },
      load(id) {
        if (id !== virtual) return
        return `
          const instances = new Map()
          let current, cursor
          export function start(id) {
            if (!instances.has(id)) instances.set(id, [])
            current = instances.get(id); cursor = 0
          }
          export function useState(initial) {
            const values = current, index = cursor++
            if (!(index in values)) values[index] = initial
            return [values[index], value => { values[index] = typeof value === 'function' ? value(values[index]) : value }]
          }`
      },
      transform(code, id) {
        if (id.endsWith('/DeliveryAddressFields.jsx')) return code.replace("from 'react'", "from 'virtual:delivery-address-state'")
      },
    }],
  })
  try {
    const state = await server.ssrLoadModule('virtual:delivery-address-state')
    const { default: Fields } = await server.ssrLoadModule('/src/components/DeliveryAddressFields.jsx')
    const original = { id: 'home', _id: 'saved-home', label: 'Family', phone: '123', address2: 'Unit 2',
      address1: 'Existing street', city: 'Addis Ababa', zip: '1000', country: 'Ethiopia' }
    const addresses = { home: original, work: { ...original, id: 'work', country: 'USA' } }
    const render = (id = 'home') => {
      state.start(id)
      return Fields({ address: addresses[id], onChange: value => { addresses[id] = value } })
    }
    const nodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)]
    const search = id => nodes(render(id)).find(node => node.props?.label === 'Search delivery address')
    const markup = renderToStaticMarkup(render())
    assert.ok(markup.indexOf('Search delivery address') < markup.indexOf('Address label'))
    assert.match(markup, /name="deliveryAddressSearch" value=""/)
    assert.match(markup, /<input[^>]*name="address1"[^>]*value="Existing street"/)
    assert.equal((markup.match(/role="combobox"/g) || []).length, 1)

    search('home').props.onChange('Edna Mall')
    assert.strictEqual(addresses.home, original, 'Typing a search must not replace the delivery address')
    assert.equal(search('home').props.value, 'Edna Mall')
    assert.equal(search('home').props.country, 'Ethiopia')
    assert.equal(search('work').props.value, '')
    assert.equal(search('work').props.country, 'USA')
    search('work').props.onChange('810 Grace')
    search('home').props.onSelect(placeAddress({
      id: 'edna-mall', formattedAddress: 'Edna Mall',
      addressComponents: [part('locality', 'Addis Ababa'), part('country', 'Ethiopia')],
      location: { lat: () => 8.996, lng: () => 38.787 },
    }))
    assert.equal(search('home').props.value, '')
    assert.equal(search('work').props.value, '810 Grace')
    for (const field of ['id', '_id', 'label', 'phone', 'address2']) assert.equal(addresses.home[field], original[field])
    assert.equal(addresses.home.address1, 'Edna Mall')
    assert.equal(addresses.home.zip, '')
    assert.equal(addresses.home.placeId, 'edna-mall')
    assert.deepEqual(addresses.home.location, { type: 'Point', coordinates: [38.787, 8.996] })
    assert.match(renderToStaticMarkup(render()), /Map location:.*Edna Mall/)

    nodes(render()).find(node => node.type === 'input' && node.props.name === 'city')
      .props.onChange({ target: { value: 'Another city' } })
    assert.equal(addresses.home.city, 'Another city')
    assert.equal(addresses.home.placeId, undefined)
    assert.equal(addresses.home.location, undefined)
    assert.doesNotMatch(renderToStaticMarkup(render()), /Map location:/)
  } finally {
    await server.close()
    await rm(cacheDir, { recursive: true, force: true })
  }
})
