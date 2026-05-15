const API_BASE_URL = 'https://easy-shop-server-wldr.onrender.com/api/v1'
const DB_KEY = 'selectedDatabaseName'

export function getSelectedDatabaseName() {
  return localStorage.getItem(DB_KEY) || ''
}

export function setSelectedDatabaseName(name) {
  if (!name) {
    localStorage.removeItem(DB_KEY)
    return
  }
  localStorage.setItem(DB_KEY, name)
}

export async function apiRequest(path, options = {}) {
  const token = localStorage.getItem('authToken')
  const databaseName = getSelectedDatabaseName()
  const isFormData = options?.body instanceof FormData

  const headers = {
    ...(options.headers || {}),
  }

  if (!isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  if (databaseName) {
    headers['x-database-name'] = databaseName
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  })

  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text()

  if (!response.ok) {
    const message =
      typeof payload === 'string'
        ? payload
        : payload?.message || 'Request failed unexpectedly.'
    throw new Error(message)
  }

  return payload
}

export { API_BASE_URL }