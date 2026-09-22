import { apiRequest } from './client'

export function getServiceRequests() {
  return apiRequest('/service-requests/mine')
}

export function createServiceRequest(payload) {
  return apiRequest('/service-requests', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
