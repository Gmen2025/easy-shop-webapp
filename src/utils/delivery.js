export const ADDRESS_FIELDS = [
  ['label', 'Address label'], ['address1', 'Street address'],
  ['address2', 'Apartment / unit (optional)'], ['city', 'City'],
  ['zip', 'Postal code (optional in Ethiopia)'], ['country', 'Country'],
  ['phone', 'Recipient phone'],
]

export const VEHICLES = ['motorcycle', 'car', 'van', 'truck']
export const cartLineKey = (product) => product.cartKey || product.id || product._id
export const addressText = (address) => [address?.address1, address?.address2, address?.city, address?.zip, address?.country].filter(Boolean).join(', ')
export const deliveryModeLabel = (mode) => ({
  STANDARD: 'Standard delivery', EXPRESS: 'Express delivery', SCHEDULED: 'Scheduled delivery',
  SAME_DAY: 'Same day (legacy)', NEXT_DAY: 'Next day (legacy)',
}[mode] || mode || 'Delivery')

export function validateAddress(address) {
  const ethiopia = /^(ethiopia|ethio|et)$/i.test(String(address.country).trim())
  for (const [key, label] of ADDRESS_FIELDS) {
    if (key === 'address2' || (key === 'zip' && ethiopia)) continue
    if (!String(address[key] || '').trim()) throw new Error(`${label} is required.`)
  }
}

export function buildQuotePayload(items, addresses, quantities, deliveryMode, scheduledFor) {
  if (!items.length) throw new Error('Your cart is empty.')
  const cart = items.map(({ product, quantity }) => ({
    key: cartLineKey(product), product: product.id || product._id, quantity,
    price: product.price, storefrontId: product.storefrontId || null,
  }))
  const allocations = []
  for (const line of cart) {
    let total = 0
    for (const address of addresses) {
      const quantity = Number(quantities[line.key]?.[address.id] || 0)
      if (!Number.isSafeInteger(quantity) || quantity < 0) throw new Error('Use non-negative whole quantities for each drop-off.')
      total += quantity
      if (quantity) allocations.push({ key: line.key, addressId: address.id, quantity })
    }
    if (total !== line.quantity) throw new Error(`Allocate all ${line.quantity} units of each cart item exactly once.`)
  }
  const used = addresses.filter((address) => allocations.some((entry) => entry.addressId === address.id))
  used.forEach(validateAddress)
  let scheduled = null
  if (deliveryMode === 'SCHEDULED') {
    const time = new Date(scheduledFor)
    if (!Number.isFinite(time.getTime()) || time.getTime() <= Date.now()) throw new Error('Choose a future delivery date and time.')
    scheduled = time.toISOString()
  }
  return { cart, addresses: used, allocations, deliveryMode, scheduledFor: scheduled }
}

export function cartMatchesQuote(items, quote) {
  return items.length === quote.cart.length && items.every(({ product, quantity }) =>
    quote.cart.some((line) => line.key === cartLineKey(product) && line.quantity === quantity &&
      line.product === (product.id || product._id) && line.price === product.price))
}

// Preview matches the mobile deliveryPricing helper; prepare remains authoritative.
export function selectDeliveryVehicle(deliveries, selections, delivery, vehicle) {
  return {
    ...selections,
    ...Object.fromEntries(deliveries.filter((entry) => delivery.pricingGroup?.kind === 'cart-route' ||
      (delivery.pricingGroup?.kind === 'store-route' ? entry.pricingGroup?.key === delivery.pricingGroup.key : entry.key === delivery.key))
      .map((entry) => [entry.key, vehicle])),
  }
}

export function calculateDeliveryPricing(deliveries, selections = {}) {
  const groups = new Map()
  for (const delivery of deliveries) {
    const vehicle = selections[delivery.key] || delivery.vehicle
    const option = vehicle
      ? delivery.vehicleOptions?.find((entry) => entry.type === vehicle)
      : [...(delivery.vehicleOptions || [])].sort((a, b) => a.fee - b.fee)[0]
    if (vehicle && delivery.vehicleOptions?.length && !option) throw new Error('Choose an offered vehicle.')
    const route = ['cart-route', 'store-route'].includes(delivery.pricingGroup?.kind)
    const key = JSON.stringify([delivery.pricingGroup?.key || delivery.key, route ? 'cart' : option?.type || vehicle || ''])
    if (!groups.has(key)) groups.set(key, [])
    if (route && groups.get(key).some((member) => member.vehicle !== (option?.type || vehicle))) {
      throw new Error(delivery.pricingGroup.kind === 'store-route'
        ? 'Choose one vehicle for the complete route from this store.' : 'Choose one vehicle for the entire cart route.')
    }
    groups.get(key).push({ delivery, fee: option?.fee ?? delivery.deliveryFee, vehicle: option?.type || vehicle })
  }
  const byKey = {}
  let total = 0
  for (const members of groups.values()) {
    members.sort((a, b) => a.delivery.distanceKm - b.delivery.distanceKm || a.delivery.key.localeCompare(b.delivery.key))
    const anchor = members[0]
    const fee = Math.round(anchor.fee * 100)
    total += fee
    ;[...members].sort((a, b) => a.delivery.key.localeCompare(b.delivery.key)).forEach(({ delivery }, index) => {
      byKey[delivery.key] = {
        deliveryFee: (Math.floor(fee / members.length) + (index < fee % members.length ? 1 : 0)) / 100,
        storeCount: new Set(members.map((member) => member.delivery.store._id)).size,
        destinationCount: members.length, storeName: anchor.delivery.store.name, sharedFee: fee / 100,
      }
    })
  }
  return { deliveryFee: total / 100, byKey }
}

export function latLng(value) {
  const coordinates = value?.coordinates || value?.location?.coordinates
  const latitude = coordinates ? coordinates[1] : value?.latitude
  const longitude = coordinates ? coordinates[0] : value?.longitude
  return Number.isFinite(latitude) && Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
    ? { lat: latitude, lng: longitude } : null
}

export function directionsUrl(destination, origin, { requireOrigin = false } = {}) {
  const to = latLng(destination)
  if (!to) return null
  const from = latLng(origin)
  if (requireOrigin && !from) return null
  const query = new URLSearchParams({ api: '1', destination: `${to.lat},${to.lng}`, travelmode: 'driving' })
  if (from) query.set('origin', `${from.lat},${from.lng}`)
  return `https://www.google.com/maps/dir/?${query}`
}
