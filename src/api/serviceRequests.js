import { apiRequest } from './client'

export function getServiceRequests() {
  return apiRequest('/service-requests/mine')
}

export function getAllServiceRequests() {
  return apiRequest('/service-requests')
}

export function updateServiceRequest(id, payload) {
  return apiRequest(`/service-requests/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function deleteServiceRequest(id) {
  return apiRequest(`/service-requests/${id}`, {
    method: 'DELETE',
  })
}

export function createServiceRequest(payload) {
  return apiRequest('/service-requests', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
