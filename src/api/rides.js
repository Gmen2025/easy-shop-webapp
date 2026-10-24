import { apiRequest } from './client'

export function getRideConfig() {
  return apiRequest('/rides/config')
}

export function getRides() {
  return apiRequest('/rides')
}

export function getRide(rideId) {
  return apiRequest(`/rides/${encodeURIComponent(rideId)}`)
}

export function getRideQuotes(payload) {
  return apiRequest('/rides/quote-options', {
    method: 'POST',
    timeoutMs: 120000,
    body: JSON.stringify(payload),
  })
}

export function requestRide(rideId) {
  return apiRequest(`/rides/${encodeURIComponent(rideId)}/request`, {
    method: 'POST',
    timeoutMs: 120000,
    body: JSON.stringify({}),
  })
}

export function cancelRide(rideId) {
  return apiRequest(`/rides/${encodeURIComponent(rideId)}/cancel`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}
