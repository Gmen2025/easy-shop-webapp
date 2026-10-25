import { normalizeStoreLogo } from './storeLogo.js'

export const OPERATION_SECTIONS = {
  stores: 'Company stores',
  drivers: 'Drivers & onboarding',
  roles: 'Assign roles',
  'store-owners': 'Store owner onboarding',
  payouts: 'Store payouts',
  broadcast: 'Broadcast notifications',
}

export function operationList(data, key) {
  const list = key ? data?.[key] : data
  if (data?.success === false || !Array.isArray(list) ||
    list.some((item) => !item || !(item._id || item.id))) {
    throw new Error(data?.message || 'The server returned an invalid operations list.')
  }
  return list
}

export function operationSuccess(data, key) {
  if (data?.success !== true || (key && !(data[key]?._id || data[key]?.id))) {
    throw new Error(data?.message || 'The server did not confirm this operation.')
  }
  return data
}

export function companyPayload(form, { driver = false, editing = false } = {}) {
  const text = (key) => String(form[key] ?? '').trim()
  const payload = { name: text('name'), email: text('email').toLowerCase(), phone: text('phone') }
  if (!payload.name || !payload.email || !payload.phone) throw new Error('Name, email and phone are required.')
  if (editing) {
    payload.address = text('address')
    if (!driver && !payload.address) throw new Error('Address is required.')
  } else {
    if (!text('address1') || !text('city') || (form.country === 'USA' && !text('zip'))) {
      throw new Error('Address, city and USA ZIP code are required.')
    }
    payload.address = [text('address1'), text('address2'), text('city'),
      ...(form.country === 'USA' ? [text('zip'), 'USA'] : [])].filter(Boolean).join(', ')
  }
  if (!editing && !form.password) throw new Error('Password is required.')
  if (form.password) payload.password = form.password
  if (driver) payload.vehicleType = text('vehicleType')
  if (!driver && form.logo !== undefined) payload.logo = normalizeStoreLogo(form.logo)
  const hasLat = String(form.latitude ?? '').trim() !== ''
  const hasLng = String(form.longitude ?? '').trim() !== ''
  if (!editing || hasLat || hasLng) {
    const latitude = Number(form.latitude)
    const longitude = Number(form.longitude)
    if (!hasLat || !hasLng || !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      throw new Error('Valid latitude and longitude are required.')
    }
    Object.assign(payload, { latitude, longitude })
  }
  return payload
}

export function filterPayouts(payouts, filter) {
  return payouts.filter((item) => filter === 'pending' ? ['pending', 'processing'].includes(item.status)
    : filter === 'paid' ? item.status === 'paid'
      : filter === 'early' ? item.payoutType === 'early_request'
        : filter === 'weekly' ? item.payoutType === 'weekly' : true)
}

export function scheduledDeliveryLabel(order) {
  const value = order.scheduledDeliveryDate || order.scheduledFor || order.scheduledDate ||
    order.rawPayload?.scheduledDeliveryDate || order.rawPayload?.scheduledFor
  if (!value) return 'Date unavailable'
  const dateOnly = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const date = dateOnly ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 12) : new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  }) : 'Date unavailable'
}

export function broadcastResult(data) {
  if (!Number.isInteger(data?.sent) || data.sent < 0 || !Array.isArray(data.tickets)) {
    throw new Error('The server returned an invalid broadcast result.')
  }
  const accepted = data.tickets.filter((ticket) => ticket.status === 'ok').length
  const errors = data.tickets.filter((ticket) => ticket.status !== 'ok')
  if (data.sent > 0 && (errors.length || accepted < data.sent)) {
    throw new Error(`Broadcast incomplete: ${accepted}/${data.sent} push requests accepted. ${
      errors.map((ticket) => ticket.message || ticket.details?.error || 'Push provider rejected a request').join('; ')
    } Review delivery before retrying to avoid duplicates.`)
  }
  return data.sent === 0 ? 'No active recipients: no valid registered push tokens.'
    : `${accepted} push requests accepted by the provider. Device delivery is not confirmed.`
}

export function createAdminOperations(request, databaseName) {
  const id = (record) => {
    const value = record?._id || record?.id
    if (!value) throw new Error('A record ID is required.')
    return encodeURIComponent(value)
  }
  const call = (path, method = 'GET', data, db = databaseName) => request(path, {
    method, headers: { 'x-database-name': db },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  })
  const mutate = async (path, method, data, key, db) =>
    operationSuccess(await call(path, method, data, db), key)
  return {
    list: async (path, key) => operationList(await call(path), key),
    saveCompany: (resource, form, record) => mutate(
      `/${resource}/admin/company-${resource}${record ? `/${id(record)}` : ''}`,
      record ? 'PUT' : 'POST', companyPayload(form, { driver: resource === 'drivers', editing: Boolean(record) }),
      resource === 'drivers' ? 'driver' : 'store'),
    access: (resource, record, action) => {
      const db = record.databaseName || databaseName
      const allowed = resource === 'drivers' ? ['approve', 'deny', 'recover', 'suspend', 'reinstate'] : ['approve', 'deny', 'recover']
      if (!allowed.includes(action)) throw new Error('Unsupported access action.')
      return mutate(`/${resource}/${id(record)}/${action}`, 'PUT', { databaseName: db },
        resource === 'drivers' ? 'driver' : 'store', db)
    },
    remove: (resource, record) => {
      const db = record.databaseName || databaseName
      return mutate(`/${resource}/${id(record)}?databaseName=${encodeURIComponent(db)}`, 'DELETE', { databaseName: db }, null, db)
    },
    availability: (record) => mutate(`/drivers/admin/company-drivers/${id(record)}`, 'PUT', { isAvailable: true }, 'driver'),
    nearby: async (resource, record) => {
      const coordinates = record.location?.coordinates
      if (!Array.isArray(coordinates) || coordinates.length !== 2 ||
        !coordinates.every((value) => typeof value === 'number' && Number.isFinite(value)) ||
        Math.abs(coordinates[0]) > 180 || Math.abs(coordinates[1]) > 90) throw new Error('This record has no valid registered coordinates.')
      const query = new URLSearchParams({ longitude: coordinates[0], latitude: coordinates[1], radiusKm: 10 })
      return operationList(await call(`/${resource}/admin/company-fulfillable?${query}`), resource)
    },
    removeRejection: (resource, record, response) =>
      mutate(`/${resource}/${id(record)}/company-responses/${id(response)}`, 'DELETE'),
    migrate: (defaultStoreId) => {
      if (!defaultStoreId) throw new Error('Select a default store.')
      return mutate('/stores/admin/inventory/migrate', 'POST', { defaultStoreId })
    },
    assignRole: (email, roleType) => {
      if (!email.trim() || !['driver', 'store_owner'].includes(roleType)) throw new Error('Email and a supported role are required.')
      return mutate('/users/admin/assign-role', 'POST', { email: email.trim().toLowerCase(), roleType, databaseName }, 'user')
    },
    payout: (record, status, reference, adminNotes) => {
      if (!['paid', 'rejected'].includes(status)) throw new Error('Unsupported payout action.')
      const db = record.databaseName || databaseName
      return mutate(`/stores/admin/payouts/${id(record)}`, 'PUT',
        { databaseName: db, status, reference: reference.trim(), adminNotes: adminNotes.trim() }, 'payout', db)
    },
    batch: () => mutate('/stores/admin/payouts/batch-weekly', 'POST', {
      databaseName, status: 'paid', adminNotes: `Weekly platform settlement processed on ${new Date().toLocaleDateString()}`,
    }),
    broadcast: async (title, body) => {
      if (!title.trim() || !body.trim()) throw new Error('Title and message are required.')
      if (title.trim().length > 80 || body.trim().length > 240) throw new Error('Title must be at most 80 characters and message at most 240.')
      return broadcastResult(await call('/notifications/admin/broadcast', 'POST', {
        title: title.trim(), body: body.trim(), data: { type: 'admin_broadcast', sentAt: new Date().toISOString() },
      }))
    },
  }
}
