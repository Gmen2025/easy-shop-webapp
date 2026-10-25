import test from 'node:test'
import assert from 'node:assert/strict'
import {
  broadcastResult, companyPayload, createAdminOperations, filterPayouts,
  operationList, operationSuccess, OPERATION_SECTIONS, scheduledDeliveryLabel,
} from '../src/utils/adminOperations.js'

const form = {
  name: ' Company ', email: ' TEST@EXAMPLE.COM ', phone: ' 123 ', password: ' password ',
  country: 'USA', address1: '1 Main', address2: '', city: 'Town', zip: '12345',
  latitude: '0', longitude: '-73.5', vehicleType: 'Car',
}

function fixture(response = { success: true, driver: { _id: 'd' }, store: { _id: 's' }, user: { _id: 'u' }, payout: { _id: 'p' } }) {
  const calls = []
  const api = createAdminOperations(async (path, options) => {
    calls.push({ path, ...options, data: options.body ? JSON.parse(options.body) : undefined })
    return response
  }, 'E_Shopping')
  return { api, calls }
}

test('all six integration sections are available', () => {
  assert.deepEqual(Object.keys(OPERATION_SECTIONS), ['stores', 'drivers', 'roles', 'store-owners', 'payouts', 'broadcast'])
})

test('company creation matches mobile address and coordinate payloads', () => {
  assert.deepEqual(companyPayload(form, { driver: true }), {
    name: 'Company', email: 'test@example.com', phone: '123', password: ' password ',
    address: '1 Main, Town, 12345, USA', latitude: 0, longitude: -73.5, vehicleType: 'Car',
  })
  assert.equal(companyPayload({ ...form, country: 'Ethio', zip: '' }).address, '1 Main, Town')
  assert.throws(() => companyPayload({ ...form, latitude: '' }), /latitude/)
  assert.throws(() => companyPayload({ ...form, longitude: '181' }), /latitude/)
  assert.throws(() => companyPayload({ ...form, zip: '' }), /ZIP/)
})

test('edits omit unchanged passwords and absent coordinates', () => {
  const payload = companyPayload({ ...form, password: '', address: 'Street', latitude: '', longitude: '' }, { editing: true })
  assert.equal(payload.address, 'Street')
  assert.equal('password' in payload, false)
  assert.equal('latitude' in payload, false)
  assert.throws(() => companyPayload({ ...form, latitude: '0', longitude: '' }, { editing: true, driver: true }), /longitude/)
})

test('company creation, editing and availability use shared routes', async () => {
  const { api, calls } = fixture()
  await api.saveCompany('stores', form)
  await api.saveCompany('drivers', { ...form, address: 'Street', password: '' }, { _id: 'd' })
  await api.availability({ _id: 'd' })
  assert.deepEqual(calls.map(({ path, method }) => [path, method]), [
    ['/stores/admin/company-stores', 'POST'], ['/drivers/admin/company-drivers/d', 'PUT'],
    ['/drivers/admin/company-drivers/d', 'PUT'],
  ])
  assert.deepEqual(calls[2].data, { isAvailable: true })
})

test('access and deletion carry exact database scope, without unsupported unsuspend fallbacks', async () => {
  const { api, calls } = fixture()
  for (const action of ['approve', 'deny', 'recover', 'suspend', 'reinstate']) {
    await api.access('drivers', { _id: 'd', databaseName: 'E_ShopUSA' }, action)
  }
  await api.access('stores', { _id: 's' }, 'recover')
  await api.remove('drivers', { _id: 'd', databaseName: 'E_ShopUSA' })
  assert.equal(calls[4].path, '/drivers/d/reinstate')
  assert.equal(calls[0].headers['x-database-name'], 'E_ShopUSA')
  assert.deepEqual(calls[0].data, { databaseName: 'E_ShopUSA' })
  assert.equal(calls.at(-1).path, '/drivers/d?databaseName=E_ShopUSA')
  assert.deepEqual(calls.at(-1).data, { databaseName: 'E_ShopUSA' })
  assert.throws(() => api.access('drivers', { _id: 'd' }, 'unsuspend'), /Unsupported/)
})

test('nearby lists use GeoJSON ordering and 10 km radius', async () => {
  const { api, calls } = fixture({ products: [{ _id: 'p' }] })
  assert.equal((await api.nearby('products', { location: { coordinates: [-73, 0] } })).length, 1)
  assert.equal(calls[0].path, '/products/admin/company-fulfillable?longitude=-73&latitude=0&radiusKm=10')
  await assert.rejects(api.nearby('orders', {}), /coordinates/)
})

test('rejections, role assignments and migration match shared endpoints', async () => {
  const { api, calls } = fixture()
  await api.removeRejection('products', { _id: 'p' }, { _id: 'r' })
  await api.removeRejection('orders', { _id: 'o' }, { _id: 'r' })
  await api.assignRole(' TEST@Example.com ', 'store_owner')
  await api.migrate('s')
  assert.equal(calls[0].path, '/products/p/company-responses/r')
  assert.equal(calls[1].path, '/orders/o/company-responses/r')
  assert.deepEqual(calls[2].data, { email: 'test@example.com', roleType: 'store_owner', databaseName: 'E_Shopping' })
  assert.equal(calls[3].path, '/stores/admin/inventory/migrate')
  assert.deepEqual(calls[3].data, { defaultStoreId: 's' })
})

test('payout updates scope to payout region and batch explicitly marks paid', async () => {
  const { api, calls } = fixture()
  await api.payout({ id: 'p', databaseName: 'E_ShopUSA' }, 'rejected', ' REF ', ' Notes ')
  await api.batch()
  assert.equal(calls[0].path, '/stores/admin/payouts/p')
  assert.deepEqual(calls[0].data, { databaseName: 'E_ShopUSA', status: 'rejected', reference: 'REF', adminNotes: 'Notes' })
  assert.equal(calls[0].headers['x-database-name'], 'E_ShopUSA')
  assert.equal(calls[1].path, '/stores/admin/payouts/batch-weekly')
  assert.equal(calls[1].data.status, 'paid')
  assert.equal(calls[1].data.databaseName, 'E_Shopping')
})

test('payout filters include processing and exact payout types', () => {
  const payouts = [{ status: 'processing', payoutType: 'weekly' }, { status: 'paid', payoutType: 'early_request' }, { status: 'rejected' }]
  assert.equal(filterPayouts(payouts, 'pending').length, 1)
  assert.equal(filterPayouts(payouts, 'early').length, 1)
  assert.equal(filterPayouts(payouts, 'weekly').length, 1)
  assert.equal(filterPayouts(payouts, 'all').length, 3)
})

test('scheduled deliveries preserve date-only calendar dates and mobile field precedence', () => {
  const expected = new Date(2026, 9, 25, 12).toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
  assert.equal(scheduledDeliveryLabel({ scheduledDeliveryDate: '2026-10-25', scheduledFor: '2026-10-26' }), expected)
  assert.equal(scheduledDeliveryLabel({ rawPayload: { scheduledFor: '2026-10-25' } }), expected)
  assert.equal(scheduledDeliveryLabel({ scheduledDate: 'bad' }), 'Date unavailable')
})

test('broadcast payload matches mobile but reports provider errors rather than fake delivery', async () => {
  const { api, calls } = fixture({ sent: 1, tickets: [{ status: 'ok', id: 'ticket' }] })
  assert.match(await api.broadcast(' Title ', ' Message '), /accepted/)
  assert.equal(calls[0].path, '/notifications/admin/broadcast')
  assert.equal(calls[0].data.title, 'Title')
  assert.equal(calls[0].data.body, 'Message')
  assert.equal(calls[0].data.data.type, 'admin_broadcast')
  assert.ok(Number.isFinite(Date.parse(calls[0].data.data.sentAt)))
  assert.match(broadcastResult({ sent: 0, tickets: [] }), /No active recipients/)
  assert.throws(() => broadcastResult({ sent: 2, tickets: [{ status: 'ok' }] }), /incomplete/)
  assert.throws(() => broadcastResult({ sent: 1, tickets: [{ status: 'error', message: 'DeviceNotRegistered' }] }), /DeviceNotRegistered/)
  assert.throws(() => broadcastResult({}), /invalid/)
})

test('malformed lists, negative acknowledgements and transport errors remain visible', async () => {
  assert.throws(() => operationList({ products: {} }, 'products'), /invalid/)
  assert.throws(() => operationList([{}]), /invalid/)
  assert.throws(() => operationSuccess({ success: false, message: 'Denied' }), /Denied/)
  assert.throws(() => operationSuccess({ success: true }, 'driver'), /confirm/)
  const { api } = fixture({ success: false, message: 'Failed' })
  await assert.rejects(api.availability({ _id: 'd' }), /Failed/)
  const failed = createAdminOperations(async () => { throw new Error('Offline') }, 'E_Shopping')
  await assert.rejects(failed.list('/drivers'), /Offline/)
})
