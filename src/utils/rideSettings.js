export const RIDE_SETTING_FIELDS = [
  ['sharedDiscountPercent', 'Shared discount (%)'],
  ['maxPickupMinutes', 'Maximum pickup wait (minutes)'],
  ['maxDetourMinutes', 'Maximum shared extra travel (minutes)'],
  ['driverRadiusKm', 'Driver search radius (km)'],
]

export const RIDE_OPTIONS = [
  { key: 'economy', label: 'Economy pricing' },
  { key: 'comfort', label: 'Comfort pricing' },
  { key: 'van', label: 'Van pricing' },
]

export const RIDE_RATE_FIELDS = [
  ['baseFare', 'Base fare'],
  ['distanceRate', 'Rate per mile (USA) / km (Ethiopia)'],
  ['minuteRate', 'Rate per minute'],
]

const VEHICLE_TYPES = ['motorcycle', 'car', 'van', 'truck']
const CAR_CLASSES = ['', 'economy', 'comfort']
const PAYMENT_STATUSES = ['review_required', 'waived', 'pending', 'completed']

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function editableNumber(value, label) {
  if (!['number', 'string'].includes(typeof value) || value === '' || !Number.isFinite(Number(value))) {
    throw new Error(`${label} must be a valid number returned by the API.`)
  }
  return String(value)
}

function optionalEditableNumber(source, key, label) {
  return source[key] === undefined ? '' : editableNumber(source[key], label)
}

export function normalizeRideConfig(source) {
  if (!isRecord(source) || typeof source.enabled !== 'boolean') {
    throw new Error('The API returned an invalid ride configuration.')
  }

  const config = { enabled: source.enabled }
  for (const [field, label] of RIDE_SETTING_FIELDS) {
    config[field] = optionalEditableNumber(source, field, label)
  }

  if (source.vehicleRates !== undefined && !isRecord(source.vehicleRates)) {
    throw new Error('The API returned invalid ride vehicle rates.')
  }
  config.vehicleRates = Object.fromEntries(RIDE_OPTIONS.map(({ key, label }) => {
    const rates = source.vehicleRates?.[key]
    if (rates === undefined) {
      return [key, { enabled: false, baseFare: '', distanceRate: '', minuteRate: '' }]
    }
    if (!isRecord(rates) || typeof rates.enabled !== 'boolean') {
      throw new Error(`The API returned invalid ${label.toLowerCase()} settings.`)
    }
    return [key, {
      enabled: rates.enabled,
      ...Object.fromEntries(RIDE_RATE_FIELDS.map(([field, rateLabel]) => [
        field, optionalEditableNumber(rates, field, `${label}: ${rateLabel}`),
      ])),
    }]
  }))
  return config
}

function numberInRange(value, label, minimum, maximum, { exclusiveMinimum = false } = {}) {
  if (value === '' || !Number.isFinite(Number(value))) throw new Error(`Enter a valid ${label}.`)
  const number = Number(value)
  if ((exclusiveMinimum ? number <= minimum : number < minimum) || number > maximum) {
    throw new Error(`${label} must be ${exclusiveMinimum ? 'greater than' : 'at least'} ${minimum} and no more than ${maximum}.`)
  }
  return number
}

export function buildRideConfigPayload(config) {
  if (!isRecord(config) || typeof config.enabled !== 'boolean' || !isRecord(config.vehicleRates)) {
    throw new Error('Choose whether ride service is enabled and configure its vehicle rates.')
  }
  const sharedDiscountPercent = numberInRange(config.sharedDiscountPercent, 'Shared discount', 0, 90)
  const maxPickupMinutes = numberInRange(config.maxPickupMinutes, 'Maximum pickup wait', 0, 120, { exclusiveMinimum: true })
  const maxDetourMinutes = numberInRange(config.maxDetourMinutes, 'Maximum shared extra travel', 0, 120)
  const driverRadiusKm = numberInRange(config.driverRadiusKm, 'Driver search radius', 0, 100, { exclusiveMinimum: true })

  const vehicleRates = Object.fromEntries(RIDE_OPTIONS.map(({ key, label }) => {
    const rates = config.vehicleRates[key]
    if (!isRecord(rates) || typeof rates.enabled !== 'boolean') {
      throw new Error(`Choose whether ${label.toLowerCase()} is available.`)
    }
    if (!rates.enabled) return [key, { enabled: false }]

    const normalizedRates = Object.fromEntries(RIDE_RATE_FIELDS.map(([field, rateLabel]) => {
      const amount = numberInRange(rates[field], `${label}: ${rateLabel}`, 0, 100000)
      if (Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) {
        throw new Error(`${label}: ${rateLabel} must have at most two decimal places.`)
      }
      return [field, amount]
    }))
    if (!Object.values(normalizedRates).some(Boolean)) {
      throw new Error(`Configure a nonzero fare for ${label.toLowerCase()}.`)
    }
    return [key, { enabled: true, ...normalizedRates }]
  }))
  if (config.enabled && !Object.values(vehicleRates).some((rates) => rates.enabled)) {
    throw new Error('Enable and price at least one passenger vehicle option before enabling rides.')
  }

  return {
    enabled: config.enabled,
    sharedDiscountPercent,
    maxPickupMinutes,
    maxDetourMinutes,
    driverRadiusKm,
    vehicleRates,
  }
}

function optionalString(source, key, label) {
  if (source[key] !== undefined && source[key] !== null && typeof source[key] !== 'string') {
    throw new Error(`The API returned an invalid ${label}.`)
  }
}

export function normalizeRideDrivers(source) {
  if (!Array.isArray(source)) throw new Error('The API returned an invalid company-driver list.')
  return source.map((driver, index) => {
    if (!isRecord(driver) || typeof driver._id !== 'string' || !driver._id ||
        typeof driver.name !== 'string' || !driver.name) {
      throw new Error(`The API returned invalid company-driver details at row ${index + 1}.`)
    }
    for (const field of ['vehicleType', 'pendingVehicleType', 'carClass']) {
      optionalString(driver, field, `company-driver ${field}`)
    }
    if (driver.vehicle !== undefined && driver.vehicle !== null &&
        (!isRecord(driver.vehicle) || (driver.vehicle.type !== undefined && typeof driver.vehicle.type !== 'string'))) {
      throw new Error(`The API returned an invalid vehicle for ${driver.name}.`)
    }
    if (driver.passengerSeats !== undefined && driver.passengerSeats !== null &&
        (!Number.isSafeInteger(driver.passengerSeats) || driver.passengerSeats < 0 || driver.passengerSeats > 16)) {
      throw new Error(`The API returned invalid passenger-seat settings for ${driver.name}.`)
    }
    if (driver.carClass !== undefined && driver.carClass !== null && !CAR_CLASSES.includes(driver.carClass)) {
      throw new Error(`The API returned an invalid car class for ${driver.name}.`)
    }
    if (driver.serviceModes !== undefined) {
      if (!isRecord(driver.serviceModes) ||
          Object.values(driver.serviceModes).some((enabled) => typeof enabled !== 'boolean')) {
        throw new Error(`The API returned invalid service modes for ${driver.name}.`)
      }
    }
    for (const field of ['sharedIntakeOpen']) {
      if (driver[field] !== undefined && typeof driver[field] !== 'boolean') {
        throw new Error(`The API returned invalid ${field} status for ${driver.name}.`)
      }
    }
    if (driver.activeRideTrip !== undefined && driver.activeRideTrip !== null &&
        typeof driver.activeRideTrip !== 'string' && !isRecord(driver.activeRideTrip)) {
      throw new Error(`The API returned invalid active-trip status for ${driver.name}.`)
    }
    for (const type of [driver.vehicleType, driver.pendingVehicleType, driver.vehicle?.type]) {
      if (type && !VEHICLE_TYPES.includes(type)) {
        throw new Error(`The API returned an unsupported vehicle type for ${driver.name}.`)
      }
    }
    return driver
  })
}

export function buildDriverConfigPayload({ vehicleType, carClass, passengerSeats }) {
  if (!VEHICLE_TYPES.includes(vehicleType)) {
    throw new Error('Select the verified motorcycle, car, van or truck.')
  }
  const seats = passengerSeats === '' ? NaN : Number(passengerSeats)
  if (['car', 'van'].includes(vehicleType) && (!Number.isSafeInteger(seats) || seats < 1 || seats > 16)) {
    throw new Error('Configure 1-16 usable passenger seats, excluding the driver.')
  }
  if (!CAR_CLASSES.includes(carClass) || (vehicleType !== 'car' && carClass !== '')) {
    throw new Error('Economy and Comfort car classes can only be assigned to cars.')
  }
  return {
    vehicleType,
    carClass: vehicleType === 'car' ? carClass : '',
    passengerSeats: Number.isFinite(seats) ? seats : 0,
  }
}

function isValidDate(value) {
  return value === undefined || value === null || Number.isFinite(new Date(value).getTime())
}

function normalizeRide(source, index) {
  if (!isRecord(source) || typeof source._id !== 'string' || !source._id ||
      !['completed', 'terminated'].includes(source.status) || typeof source.paymentStatus !== 'string' ||
      !PAYMENT_STATUSES.includes(source.paymentStatus) ||
      typeof source.currency !== 'string' || !['usd', 'etb'].includes(source.currency.toLowerCase()) ||
      !Number.isFinite(source.estimate) || !Array.isArray(source.stops) || source.stops.length < 2) {
    throw new Error(`The API returned invalid completed-ride details at row ${index + 1}.`)
  }
  if (source.user !== undefined && source.user !== null &&
      typeof source.user !== 'string' && !isRecord(source.user)) {
    throw new Error(`The API returned invalid payer details for ride ${source._id}.`)
  }
  if (source.paymentMethod !== undefined && source.paymentMethod !== null && typeof source.paymentMethod !== 'string') {
    throw new Error(`The API returned an invalid payment method for ride ${source._id}.`)
  }
  for (const field of ['finalFare']) {
    if (source[field] !== undefined && source[field] !== null && !Number.isFinite(source[field])) {
      throw new Error(`The API returned an invalid ${field} for ride ${source._id}.`)
    }
  }
  for (const [stopIndex, stop] of source.stops.entries()) {
    if (!isRecord(stop) || !['pickup', 'dropoff'].includes(stop.type) ||
        !isRecord(stop.address)) {
      throw new Error(`The API returned invalid stop ${stopIndex + 1} for ride ${source._id}.`)
    }
    for (const field of ['address1', 'address2', 'city', 'zip', 'country']) {
      optionalString(stop.address, field, `ride address ${field}`)
    }
  }
  if (source.termination !== undefined && source.termination !== null) {
    if (!isRecord(source.termination) || !isValidDate(source.termination.at) ||
        (source.termination.reason !== undefined && typeof source.termination.reason !== 'string') ||
        (source.termination.reviewNote !== undefined && typeof source.termination.reviewNote !== 'string') ||
        (source.termination.location !== undefined && source.termination.location !== null &&
          (!isRecord(source.termination.location) || !Array.isArray(source.termination.location.coordinates) ||
            source.termination.location.coordinates.some((coordinate) => !Number.isFinite(coordinate))))) {
      throw new Error(`The API returned invalid termination details for ride ${source._id}.`)
    }
  }
  if (source.bankAccount !== undefined && source.bankAccount !== null &&
      (!isRecord(source.bankAccount) ||
        (source.bankAccount.bankName !== undefined && typeof source.bankAccount.bankName !== 'string') ||
        (source.bankAccount.accountNumber !== undefined && typeof source.bankAccount.accountNumber !== 'string'))) {
    throw new Error(`The API returned invalid bank details for ride ${source._id}.`)
  }
  for (const field of ['bankSender', 'bankReference']) optionalString(source, field, `ride ${field}`)
  return source
}

export function normalizeRidePayments(source) {
  if (!Array.isArray(source)) throw new Error('The API returned an invalid completed-ride and payment list.')
  return source.map(normalizeRide)
}

export function buildTerminationReviewPayload({ fare, note }, waive = false) {
  const normalizedNote = typeof note === 'string' ? note.trim() : ''
  if (!normalizedNote || normalizedNote.length > 500) {
    throw new Error('Enter an Admin review note (1-500 characters).')
  }
  const amount = waive ? 0 : (fare === '' ? NaN : Number(fare))
  if (!Number.isFinite(amount) || amount < 0 ||
      !Number.isSafeInteger(Math.round(amount * 100)) ||
      Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) {
    throw new Error('Enter a non-negative reviewed fare with at most two decimal places.')
  }
  return { fare: amount, note: normalizedNote }
}
