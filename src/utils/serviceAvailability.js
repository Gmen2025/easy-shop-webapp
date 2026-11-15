export const SERVICE_LABELS = { rides: 'Ride service', services: 'Service requests', financialHealth: 'Financial Health' }

export function validateServiceAvailability(data) {
  if (Object.keys(SERVICE_LABELS).some((key) => typeof data?.[key] !== 'boolean') ||
      (data.testingAccess !== undefined && typeof data.testingAccess !== 'boolean')) {
    throw new Error('Service availability could not be verified. Please retry.')
  }

  return data
}

export const effectiveServiceAvailability = (data) => ({
  ...data, ...Object.fromEntries(Object.keys(SERVICE_LABELS).map((key) => [key, data[key] || data.testingAccess === true])),
})
