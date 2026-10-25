import { apiRequest } from './client'

export function getDeliverySettings() {
  return apiRequest('/settings/delivery')
}

export function updateDeliverySettings(deliveryConfig, deliveryOrigin) {
  return apiRequest('/settings/delivery', {
    method: 'PUT',
    body: JSON.stringify({ deliveryConfig, deliveryOrigin }),
  })
}

export function estimateDeliveryDistance(destinationAddress) {
  return apiRequest('/settings/delivery/estimate-distance', {
    method: 'POST',
    body: JSON.stringify({ destinationAddress }),
  })
}

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
