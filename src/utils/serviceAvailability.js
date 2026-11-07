export const SERVICE_LABELS = { rides: 'Ride service', services: 'Service requests' }

export function validateServiceAvailability(data) {
  if (typeof data?.rides !== 'boolean' || typeof data?.services !== 'boolean') {
    throw new Error('Service availability could not be verified. Please retry.')
  }
  return data
}
