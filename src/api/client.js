const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV
    ? '/api/v1'
    : 'https://easy-shop-server-wldr.onrender.com/api/v1')
const DB_KEY = 'selectedDatabaseName'
const REQUEST_TIMEOUT_MS = 45000

export function getSelectedDatabaseName() {
  return localStorage.getItem(DB_KEY) || 'E_Shopping'
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
  const explicitDatabaseName = options.headers?.['x-database-name']
  const databaseName = explicitDatabaseName || getSelectedDatabaseName()
  const isFormData = options?.body instanceof FormData
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

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

  let response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    })
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Request timed out. Please try again or switch database.')
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }

  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text()

  if (!response.ok) {
    const message =
      typeof payload === 'string'
        ? payload
        : payload?.message || 'Request failed unexpectedly.'

    if (response.status === 401) {
      localStorage.removeItem('authUser')
      localStorage.removeItem('authToken')

      if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
        window.location.assign('/login')
      }
    }

    throw new Error(message)
  }

  return payload
}

export { API_BASE_URL }