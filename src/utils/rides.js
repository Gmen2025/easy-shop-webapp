import { editAddress, addressCountryCode } from './addressAutocomplete.js'
import { addressText, latLng, validateAddress } from './delivery.js'

export const RIDE_OPTIONS = [
  { key: 'economy', name: 'Economy', detail: 'Economy car' },
  { key: 'comfort', name: 'Comfort', detail: 'Comfort car' },
  { key: 'van', name: 'Van', detail: 'More passengers' },
]
export const RIDE_STEPS = ['Your trip', 'Map & stops', 'Select ride', 'Trip summary']

export function newRideStop(type, country, phone = '') {
  return {
    id: crypto.randomUUID(), type, passengers: '1',
    address: { label: type === 'pickup' ? 'Pickup' : 'Drop-off', address1: '', address2: '', city: '', zip: '', country, phone },
  }
}

export function balanceRideStops(stops) {
  const remaining = stops.slice(0, -1).reduce((total, stop) =>
    total + (stop.type === 'pickup' ? 1 : -1) * Number(stop.passengers), 0)
  return stops.map((stop, index) => index === stops.length - 1
    ? { ...stop, type: 'dropoff', passengers: stops.slice(0, -1).some((entry) => entry.passengers === '') ||
        !Number.isFinite(remaining) ? '' : String(remaining) }
    : index === 0 ? { ...stop, type: 'pickup' } : stop)
}

export function editRideAddress(address, field, value) {
  const next = editAddress(address, field, value)
  if (!['label', 'phone'].includes(field)) delete next._id
  if (['address1', 'address2', 'city', 'zip', 'country'].includes(field)) {
    delete next.currentLocation
    delete next.formattedAddress
  }
  return next
}

export function buildRidePayload(mode, stops, country) {
  if (!['regular', 'shared'].includes(mode) || stops.length < 2 || stops.length > 12 ||
      (mode === 'shared' && stops.length !== 2)) {
    throw new Error('Use 2-12 stops for a regular ride, or one pickup and one drop-off for a shared ride.')
  }
  let onboard = 0
  const payload = stops.map((stop, index) => {
    try {
      validateAddress(stop.address)
    } catch (failure) {
      throw new Error(`Stop ${index + 1}: ${failure.message}`, { cause: failure })
    }
    if (Object.values(stop.address).some((value) => typeof value === 'string' && value.length > 300)) {
      throw new Error(`Stop ${index + 1}: address fields must be at most 300 characters.`)
    }
    if (addressCountryCode(stop.address.country) !== addressCountryCode(country)) {
      throw new Error(`Stop ${index + 1}: choose an address in ${country}.`)
    }
    const passengers = Number(stop.passengers)
    if (!Number.isSafeInteger(passengers) || passengers < 1 || passengers > 16) {
      throw new Error(`Stop ${index + 1}: enter 1-16 passengers.`)
    }
    onboard += (stop.type === 'pickup' ? 1 : -1) * passengers
    if (!['pickup', 'dropoff'].includes(stop.type) || onboard < 0 || onboard > 16) {
      throw new Error('Pick up passengers before dropping them off, with at most 16 onboard.')
    }
    return { type: stop.type, passengers, address: stop.address }
  })
  if (stops[0].type !== 'pickup' || stops.at(-1).type !== 'dropoff' || onboard !== 0) {
    throw new Error('Start with a pickup, finish with a drop-off, and account for every passenger.')
  }
  return { mode, stops: payload }
}

export function validateRideQuotes(result) {
  if (!Array.isArray(result?.quotes) || !result.quotes.length || result.quotes.some((quote) =>
    !quote?._id || !RIDE_OPTIONS.some((option) => option.key === quote.vehicleOption) ||
    !Number.isFinite(quote.estimate) || quote.estimate <= 0 ||
    !Number.isFinite(quote.baseline?.minutes) || quote.baseline.minutes < 0 ||
    !Number.isFinite(quote.baseline?.distanceKm) || quote.baseline.distanceKm < 0 ||
    !Number.isSafeInteger(quote.seats) || quote.seats < 1 || quote.seats > 16 ||
    !['usd', 'etb'].includes(quote.currency) || !Number.isFinite(new Date(quote.expiresAt).getTime()))) {
    throw new Error('No valid priced ride options were returned. Check your addresses and calculate again.')
  }
  return result.quotes
}

export const rideFare = (quote) => `${quote.currency.toUpperCase()} ${quote.estimate.toFixed(2)}`
export const rideStopTitle = (stop, index) => `${index + 1}. ${stop.type === 'pickup' ? 'Pickup' : 'Drop-off'}`

export function rideDirectionsUrl(stops) {
  const locations = stops.map((stop) => {
    const point = latLng(stop.address)
    return point ? `${point.lat},${point.lng}` : stop.address?.address1?.trim() ? addressText(stop.address) : ''
  })
  if (locations.length < 2 || locations.some((location) => !location)) return null
  const query = new URLSearchParams({
    api: '1', travelmode: 'driving', origin: locations[0], destination: locations.at(-1),
  })
  if (locations.length > 2) query.set('waypoints', locations.slice(1, -1).join('|'))
  return `https://www.google.com/maps/dir/?${query}`
}
