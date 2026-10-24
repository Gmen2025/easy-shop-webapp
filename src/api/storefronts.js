import { apiRequest } from './client'

export function getStores() {
  return apiRequest('/stores/directory')
}

export function getStorefront(storeId) {
  return apiRequest(`/stores/directory/${encodeURIComponent(storeId)}/products`)
}
