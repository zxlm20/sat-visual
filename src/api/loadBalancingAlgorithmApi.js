const API_BASE_URL = process.env.VUE_APP_API_BASE_URL || ''
const LB_API_PREFIX = '/api/lb'
const REQUEST_TIMEOUT_MS = 10000

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

export function getLoadBalancingApiErrorMessage(error) {
  if (!error) return '未知错误'

  if (error.name === 'AbortError') return '请求已取消'
  if (error.name === 'RequestTimeoutError') return error.message

  return error.message || '未知错误'
}

export function isAbortError(error) {
  return error?.name === 'AbortError'
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

async function fetchLoadBalancingJson(path, options = {}) {
  const {
    body,
    headers,
    method = 'GET',
    signal,
    timeoutMs = REQUEST_TIMEOUT_MS
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
    const response = await fetch(joinUrl(API_BASE_URL, `${LB_API_PREFIX}${path}`), {
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
      error.name = 'LoadBalancingApiError'
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

export async function getLoadBalancingAlgorithms(options = {}) {
  return fetchLoadBalancingJson('/algorithms', options)
}

export async function saveLoadBalancingAlgorithmConfig(algorithmId, parameters, options = {}) {
  return fetchLoadBalancingJson(`/algorithms/${encodeURIComponent(algorithmId)}/config`, {
    ...options,
    method: 'PUT',
    body: { parameters }
  })
}

export async function switchLoadBalancingAlgorithm(algorithmId, parameters = {}, options = {}) {
  return fetchLoadBalancingJson('/switch', {
    ...options,
    method: 'POST',
    body: {
      algorithm_id: algorithmId,
      parameters
    }
  })
}

export async function getCurrentLoadBalancingAlgorithm(options = {}) {
  return fetchLoadBalancingJson('/current', options)
}

export async function getLoadBalancingExecutionStatus(options = {}) {
  return fetchLoadBalancingJson('/status', options)
}

export async function getLatestLoadBalancingResult(options = {}) {
  return fetchLoadBalancingJson('/results/latest', options)
}
