const API_BASE_URL = process.env.VUE_APP_API_BASE_URL || ''
const LINK_API_PREFIX = '/api/links'
const QUERY_TIMEOUT_MS = 12000
const HISTORY_TIMEOUT_MS = 20000
const MUTATION_TIMEOUT_MS = 15000

function joinUrl(baseUrl, path) {
  if (!baseUrl) return path
  return `${baseUrl.replace(/\/$/, '')}${path}`
}

function normalizeDetail(detail) {
  if (!detail) return ''

  if (typeof detail === 'string') return detail

  if (Array.isArray(detail)) {
    return detail
      .map((item) => item?.msg || item?.message || JSON.stringify(item))
      .filter(Boolean)
      .join('；')
  }

  if (typeof detail === 'object') return JSON.stringify(detail)

  return String(detail)
}

function createTimeoutError(path, timeoutMs) {
  const timeoutError = new Error(`请求超时（${Math.ceil(timeoutMs / 1000)} 秒）：${path.split('?')[0]}`)
  timeoutError.name = 'RequestTimeoutError'
  return timeoutError
}

function abortWithReason(controller, reason) {
  if (controller.signal.aborted) return

  try {
    controller.abort(reason)
  } catch (_) {
    controller.abort()
  }
}

function appendDefinedParam(params, name, value) {
  if (value === undefined || value === null || value === '') return
  params.set(name, String(value))
}

function buildLinkStatusQuery(filters = {}) {
  const params = new URLSearchParams()

  appendDefinedParam(params, 'time_index', filters.timeIndex)
  appendDefinedParam(params, 'orbit_layer', filters.orbitLayer)
  appendDefinedParam(params, 'constellation_id', filters.constellationId)
  appendDefinedParam(params, 'include_dynamic_links', filters.includeDynamicLinks)
  appendDefinedParam(params, 'include_operational_links', filters.includeOperationalLinks)
  appendDefinedParam(params, 'node_id', filters.nodeId)
  appendDefinedParam(params, 'link_type', filters.linkType)
  appendDefinedParam(params, 'status', filters.status)

  const query = params.toString()
  return query ? `?${query}` : ''
}

function buildLinkHistoryQuery(filters = {}) {
  const params = new URLSearchParams()

  appendDefinedParam(params, 'start_time_index', filters.startTimeIndex)
  appendDefinedParam(params, 'end_time_index', filters.endTimeIndex)
  appendDefinedParam(params, 'step', filters.step)
  appendDefinedParam(params, 'node_id', filters.nodeId)
  appendDefinedParam(params, 'link_type', filters.linkType)

  const query = params.toString()
  return query ? `?${query}` : ''
}

async function fetchLinkJson(path, options = {}) {
  const {
    body,
    headers,
    method = 'GET',
    signal,
    timeoutMs = QUERY_TIMEOUT_MS
  } = options

  const controller = new AbortController()
  const timeoutError = createTimeoutError(path, timeoutMs)
  let abortListener = null
  let abortedByTimeout = false

  const timer = window.setTimeout(() => {
    abortedByTimeout = true
    abortWithReason(controller, timeoutError)
  }, timeoutMs)

  if (signal) {
    abortListener = () => {
      abortWithReason(controller, signal.reason || new DOMException('Aborted', 'AbortError'))
    }
    signal.addEventListener('abort', abortListener, { once: true })
  }

  try {
    const response = await fetch(joinUrl(API_BASE_URL, `${LINK_API_PREFIX}${path}`), {
      method,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(headers || {})
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    })

    if (response.status === 204) return null

    const text = await response.text()
    let data = null

    if (text) {
      try {
        data = JSON.parse(text)
      } catch (_) {
        data = text
      }
    }

    if (!response.ok) {
      const detail = data?.detail || data?.message || data?.error || data
      const message = normalizeDetail(detail) || `请求失败（HTTP ${response.status}）`
      const error = new Error(message)
      error.name = 'LinkStateApiError'
      error.status = response.status
      error.data = data
      throw error
    }

    return data
  } catch (error) {
    if (abortedByTimeout) throw timeoutError
    throw error
  } finally {
    window.clearTimeout(timer)
    if (signal && abortListener) {
      signal.removeEventListener('abort', abortListener)
    }
  }
}

export function getLinkStateErrorMessage(error) {
  if (!error) return '未知错误'

  if (error.name === 'AbortError') return '请求已取消'
  if (error.name === 'RequestTimeoutError') return error.message
  if (error.name === 'TypeError' && !error.status) {
    return '无法连接链路状态服务，请检查网络或接口地址'
  }

  if (error.status === 400) return error.message || '链路状态请求参数不合法'
  if (error.status === 404) return error.message || '该链路在当前时刻不可见'
  if (error.status >= 500) return error.message || '链路状态服务异常，请稍后重试'

  return error.message || '未知错误'
}

export function isAbortError(error) {
  return error?.name === 'AbortError'
}

export function isRequestTimeoutError(error) {
  return error?.name === 'RequestTimeoutError'
}

export async function getLinkStatus(filters = {}, options = {}) {
  return fetchLinkJson(`/status${buildLinkStatusQuery(filters)}`, options)
}

export async function getLinkDetail(linkId, filters = {}, options = {}) {
  const params = new URLSearchParams()
  appendDefinedParam(params, 'time_index', filters.timeIndex)
  const query = params.toString()
  return fetchLinkJson(`/${encodeURIComponent(linkId)}${query ? `?${query}` : ''}`, options)
}

export async function getLinkThresholds(options = {}) {
  return fetchLinkJson('/thresholds', options)
}

export async function updateLinkThresholds(patch, options = {}) {
  return fetchLinkJson('/thresholds', {
    ...options,
    method: 'PUT',
    timeoutMs: MUTATION_TIMEOUT_MS,
    body: patch
  })
}

export async function getLinkHistory(filters = {}, options = {}) {
  return fetchLinkJson(`/history${buildLinkHistoryQuery(filters)}`, {
    timeoutMs: HISTORY_TIMEOUT_MS,
    ...options
  })
}

export async function getBusinessFlows(options = {}) {
  return fetchLinkJson('/business-flows', options)
}
