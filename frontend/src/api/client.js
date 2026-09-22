// Base HTTP client for talking to the Frappe backend.
// No endpoint-specific logic lives here — just the shared request wrapper.

const BASE_URL = '/api'

function getCsrfToken() {
  return window.frappe?.csrf_token || window.csrf_token || ''
}

async function request(method, path, { params, data } = {}) {
  const url = new URL(`${BASE_URL}${path}`, window.location.origin)
  if (params) {
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))
  }

  const response = await fetch(url, {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Frappe-CSRF-Token': getCsrfToken(),
    },
    body: data ? JSON.stringify(data) : undefined,
  })

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`)
  }

  return response.json()
}

export default {
  get: (path, params) => request('GET', path, { params }),
  post: (path, data) => request('POST', path, { data }),
  put: (path, data) => request('PUT', path, { data }),
  delete: (path) => request('DELETE', path),
}
