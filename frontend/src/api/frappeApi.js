const BASE_URL = '/api'

export class FrappeApiError extends Error {
  constructor(message, { status = 0, excType = null, serverMessages = [], data = null } = {}) {
    super(message)
    this.name = 'FrappeApiError'
    this.status = status
    this.excType = excType
    this.serverMessages = serverMessages
    this.data = data
  }
}

const CSRF_METHOD = 'smart_print_format.api.get_csrf_token'
let fetchedCsrfToken = null

function pageCsrfToken() {
  const token = window.frappe?.csrf_token || window.csrf_token || ''

  return token === 'None' ? '' : token
}

async function getCsrfToken({ refresh = false } = {}) {
  const fromPage = pageCsrfToken()
  if (fromPage && !refresh) return fromPage

  if (!fetchedCsrfToken || refresh) {
    fetchedCsrfToken = request('GET', `/method/${CSRF_METHOD}`)
      .then((body) => body.message || '')
      .catch(() => '')
  }
  return fetchedCsrfToken
}

function toQueryValue(value) {
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

function buildUrl(path, params) {
  const url = new URL(`${BASE_URL}${path}`, window.location.origin)
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, toQueryValue(value))
    }
  })
  return url
}

function parseServerMessages(raw) {
  if (!raw) return []
  try {
    return JSON.parse(raw).map((item) => {
      try {
        return JSON.parse(item).message
      } catch {
        return item
      }
    })
  } catch {
    return []
  }
}

async function parseBody(response) {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { message: text }
  }
}

function stripHtml(value) {
  const html = String(value ?? '')
  if (typeof DOMParser === 'undefined') return html.replace(/<[^>]*>/g, '')
  return new DOMParser().parseFromString(html, 'text/html').body.textContent || ''
}

function toApiError(response, body) {
  const serverMessages = parseServerMessages(body._server_messages).map(stripHtml)
  const exceptionLine = typeof body.exception === 'string' ? body.exception.split('\n')[0] : ''
  const message =
    serverMessages[0] ||
    exceptionLine.replace(/^[\w.]+:\s*/, '') ||
    (typeof body.message === 'string' && body.message) ||
    `Request failed: ${response.status} ${response.statusText}`

  return new FrappeApiError(message, {
    status: response.status,
    excType: body.exc_type || null,
    serverMessages,
    data: body,
  })
}

export async function request(method, path, { params, data, retryCsrf = true } = {}) {
  const headers = { Accept: 'application/json' }
  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json'
    headers['X-Frappe-CSRF-Token'] = await getCsrfToken()
  }

  let response
  try {
    response = await fetch(buildUrl(path, params), {
      method,
      credentials: 'include',
      headers,
      body: data ? JSON.stringify(data) : undefined,
    })
  } catch (error) {
    throw new FrappeApiError(`Network error: ${error.message}`)
  }

  const body = await parseBody(response)
  if (!response.ok) {
    if (body.exc_type === 'CSRFTokenError' && retryCsrf) {
      await getCsrfToken({ refresh: true })
      return request(method, path, { params, data, retryCsrf: false })
    }
    throw toApiError(response, body)
  }
  return body
}

export async function callMethod(method, args = {}, { httpMethod = 'POST' } = {}) {
  const body =
    httpMethod === 'GET'
      ? await request('GET', `/method/${method}`, { params: args })
      : await request('POST', `/method/${method}`, { data: args })
  return body.message
}

export const getMethod = (method, args) => callMethod(method, args, { httpMethod: 'GET' })
export const postMethod = (method, args) => callMethod(method, args, { httpMethod: 'POST' })

const resourcePath = (doctype, name) =>
  name
    ? `/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`
    : `/resource/${encodeURIComponent(doctype)}`

export async function getList(
  doctype,
  { fields = ['name'], filters, orderBy, limit = 20, start = 0 } = {},
) {
  const body = await request('GET', resourcePath(doctype), {
    params: {
      fields,
      filters,
      order_by: orderBy,
      limit_page_length: limit,
      limit_start: start,
    },
  })
  return body.data
}

export async function getDoc(doctype, name) {
  const body = await request('GET', resourcePath(doctype, name))
  return body.data
}
