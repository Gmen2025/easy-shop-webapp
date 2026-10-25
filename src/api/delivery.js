import { apiRequest } from './client'

export function deliveryRequest(path, { method = 'GET', data, ...options } = {}) {
  return apiRequest(`/stores/${path}`, {
    ...options,
    method,
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  })
}

export function orderAction(id, action, data = {}) {
  return apiRequest(`/orders/${id}${action ? `/${action}` : ''}`, {
    method: 'PUT',
    body: JSON.stringify(data),
    timeoutMs: 20000,
  })
}
