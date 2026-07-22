import { computed, reactive } from 'vue'
import {
  getCurrentLoadBalancingAlgorithm,
  getLatestLoadBalancingResult,
  getLoadBalancingAlgorithms,
  getLoadBalancingApiErrorMessage,
  getLoadBalancingExecutionStatus,
  isAbortError,
  isRequestTimeoutError,
  saveLoadBalancingAlgorithmConfig,
  switchLoadBalancingAlgorithm
} from '@/api/loadBalancingAlgorithmApi'

const TERMINAL_STATES = new Set(['succeeded', 'fallback_succeeded', 'failed'])

const state = reactive({
  algorithms: [],
  current: null,
  executionStatus: null,
  latestResult: null,
  selectedAlgorithmId: '',
  parameterDraft: {},
  parameterErrors: {},
  loadingAlgorithms: false,
  loadingCurrent: false,
  loadingStatus: false,
  loadingResult: false,
  saving: false,
  polling: false,
  error: '',
  errorStatus: null,
  actionMessage: '',
  lastAppliedRevision: null,
  lastMatchedStatus: null,
  updateTime: null
})

let pollingController = null

function findAlgorithm(algorithmId) {
  return state.algorithms.find((algorithm) => algorithm.algorithm_id === algorithmId) || null
}

function setError(error, fallbackMessage) {
  if (isAbortError(error)) return
  state.error = getLoadBalancingApiErrorMessage(error) || fallbackMessage
  state.errorStatus = error?.status || null
}

function resetError() {
  state.error = ''
  state.errorStatus = null
}

function getFieldNameFromLocation(location = []) {
  const path = Array.isArray(location) ? location.map((item) => String(item)) : []
  const parameterIndex = path.findIndex((item) => item === 'parameters')
  if (parameterIndex >= 0 && path[parameterIndex + 1]) {
    return path[parameterIndex + 1]
  }

  const last = path[path.length - 1]
  return last && last !== 'body' ? last : ''
}

function extractParameterErrors(error) {
  const detail = error?.data?.detail
  if (!Array.isArray(detail)) return {}

  return detail.reduce((result, item) => {
    const fieldName = getFieldNameFromLocation(item?.loc)
    if (fieldName) {
      result[fieldName] = item?.msg || item?.message || `${fieldName} 参数不合法`
    }
    return result
  }, {})
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function parametersMatch(left = {}, right = {}) {
  return stableStringify(left || {}) === stableStringify(right || {})
}

export function initialLoadBalancingParameters(algorithm) {
  const result = {}
  const definitions = algorithm?.parameters || {}
  const saved = algorithm?.configured_parameters || {}

  Object.entries(definitions).forEach(([name, definition]) => {
    if (Object.prototype.hasOwnProperty.call(saved, name)) {
      result[name] = saved[name]
    } else if (Object.prototype.hasOwnProperty.call(definition, 'default')) {
      result[name] = definition.default
    }
  })

  return result
}

function normalizeEnumValue(definition, value) {
  if (!definition.enum || definition.enum.some((item) => item === value)) {
    return value
  }

  const matched = definition.enum.find((item) => String(item) === String(value))
  return matched === undefined ? value : matched
}

export function normalizeLoadBalancingParameter(name, definition = {}, rawValue) {
  if (rawValue === '' || rawValue === null || rawValue === undefined) {
    if (definition.required) {
      throw new Error(`${name} 为必填参数`)
    }
    return undefined
  }

  let value

  if (definition.type === 'integer') {
    value = Number(rawValue)
    if (!Number.isInteger(value)) {
      throw new Error(`${name} 必须是整数`)
    }
  } else if (definition.type === 'number') {
    value = Number(rawValue)
    if (!Number.isFinite(value)) {
      throw new Error(`${name} 必须是数字`)
    }
  } else if (definition.type === 'boolean') {
    value = typeof rawValue === 'boolean' ? rawValue : rawValue === 'true'
  } else {
    value = String(rawValue)
  }

  value = normalizeEnumValue(definition, value)

  if (
    typeof value === 'number' &&
    definition.minimum !== undefined &&
    value < definition.minimum
  ) {
    throw new Error(`${name} 不能小于 ${definition.minimum}`)
  }

  if (
    typeof value === 'number' &&
    definition.maximum !== undefined &&
    value > definition.maximum
  ) {
    throw new Error(`${name} 不能大于 ${definition.maximum}`)
  }

  if (definition.enum && !definition.enum.some((item) => item === value)) {
    throw new Error(`${name} 不在允许范围内`)
  }

  return value
}

export function normalizeLoadBalancingParameters(definitions = {}, formValues = {}) {
  const result = {}
  const errors = {}

  Object.entries(definitions).forEach(([name, definition]) => {
    try {
      const value = normalizeLoadBalancingParameter(name, definition, formValues[name])
      if (value !== undefined) result[name] = value
    } catch (error) {
      errors[name] = error?.message || `${name} 参数不合法`
    }
  })

  if (Object.keys(errors).length) {
    const error = new Error(Object.values(errors).join('；'))
    error.name = 'LoadBalancingParameterError'
    error.fields = errors
    throw error
  }

  return result
}

function syncSelectedAlgorithmFromCurrent() {
  const selectedAlgorithmId = state.current?.desired?.algorithm_id || state.current?.algorithm_id
  if (!selectedAlgorithmId) return

  state.selectedAlgorithmId = selectedAlgorithmId
  const selectedAlgorithm = findAlgorithm(selectedAlgorithmId)
  if (selectedAlgorithm) {
    state.parameterDraft = initialLoadBalancingParameters(selectedAlgorithm)
  }
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true }
    )
  })
}

async function fetchAlgorithms(options = {}) {
  state.loadingAlgorithms = true
  resetError()

  try {
    const data = await getLoadBalancingAlgorithms(options)
    state.algorithms = data?.algorithms || []
    state.updateTime = Date.now()
    syncSelectedAlgorithmFromCurrent()
    return state.algorithms
  } catch (error) {
    setError(error, '获取负载均衡算法列表失败')
    throw error
  } finally {
    state.loadingAlgorithms = false
  }
}

async function fetchCurrent(options = {}) {
  state.loadingCurrent = true
  resetError()

  try {
    const data = await getCurrentLoadBalancingAlgorithm(options)
    state.current = data || null
    state.executionStatus = data?.runtime || state.executionStatus
    state.updateTime = Date.now()
    syncSelectedAlgorithmFromCurrent()
    return state.current
  } catch (error) {
    setError(error, '获取当前负载均衡配置失败')
    throw error
  } finally {
    state.loadingCurrent = false
  }
}

async function fetchExecutionStatus(options = {}) {
  state.loadingStatus = true
  resetError()

  try {
    const data = await getLoadBalancingExecutionStatus(options)
    state.executionStatus = data || null
    state.updateTime = Date.now()
    return state.executionStatus
  } catch (error) {
    setError(error, '获取负载均衡执行状态失败')
    throw error
  } finally {
    state.loadingStatus = false
  }
}

async function fetchLatestResult(options = {}) {
  state.loadingResult = true
  resetError()

  try {
    const data = await getLatestLoadBalancingResult(options)
    state.latestResult = data || null
    state.updateTime = Date.now()
    return state.latestResult
  } catch (error) {
    setError(error, '获取最近调度结果失败')
    throw error
  } finally {
    state.loadingResult = false
  }
}

async function fetchOverview(options = {}) {
  resetError()
  const [algorithms, current] = await Promise.all([
    fetchAlgorithms(options),
    fetchCurrent(options)
  ])
  return { algorithms, current }
}

function selectAlgorithm(algorithmId) {
  state.selectedAlgorithmId = algorithmId
  state.parameterErrors = {}
  state.actionMessage = ''
  resetError()

  const algorithm = findAlgorithm(algorithmId)
  state.parameterDraft = algorithm ? initialLoadBalancingParameters(algorithm) : {}
}

function updateParameterDraft(name, value) {
  state.parameterDraft = {
    ...state.parameterDraft,
    [name]: value
  }
  state.parameterErrors = {
    ...state.parameterErrors,
    [name]: ''
  }
  if (state.errorStatus === 422) resetError()
}

function buildParameters(algorithm = selectedAlgorithm.value) {
  if (!algorithm) throw new Error('请选择负载均衡算法')

  try {
    state.parameterErrors = {}
    return normalizeLoadBalancingParameters(algorithm.parameters || {}, state.parameterDraft)
  } catch (error) {
    state.parameterErrors = error.fields || {}
    throw error
  }
}

async function saveSelectedAlgorithmConfig() {
  const algorithm = selectedAlgorithm.value
  if (!algorithm) throw new Error('请选择负载均衡算法')

  state.saving = true
  resetError()
  state.actionMessage = ''

  try {
    const parameters = buildParameters(algorithm)
    const data = await saveLoadBalancingAlgorithmConfig(algorithm.algorithm_id, parameters)
    state.actionMessage = '算法参数已保存'
    await fetchAlgorithms()
    return data
  } catch (error) {
    if (error?.status === 422) {
      state.parameterErrors = extractParameterErrors(error)
    }
    setError(error, '保存算法参数失败')
    throw error
  } finally {
    state.saving = false
  }
}

async function switchSelectedAlgorithm() {
  const algorithm = selectedAlgorithm.value
  if (!algorithm) {
    state.error = '请选择负载均衡算法'
    state.errorStatus = null
    throw new Error(state.error)
  }
  if (algorithm.runtime_available === false) {
    state.error = algorithm.runtime_registry_error || '该算法尚未由 dispatcher 加载，不能应用'
    state.errorStatus = 409
    throw new Error(state.error)
  }

  state.saving = true
  resetError()
  state.actionMessage = ''

  let parameters = {}

  try {
    parameters = buildParameters(algorithm)
    const data = await switchLoadBalancingAlgorithm(algorithm.algorithm_id, parameters)
    state.lastAppliedRevision = data?.revision ?? null
    state.actionMessage = data?.message || '已保存，从下一任务开始生效'
    await Promise.all([fetchAlgorithms(), fetchCurrent()])
    return data
  } catch (error) {
    if (error?.status === 422) {
      state.parameterErrors = extractParameterErrors(error)
    }

    if (isRequestTimeoutError(error)) {
      try {
        const current = await fetchCurrent()
        if (
          current?.desired?.algorithm_id === algorithm.algorithm_id &&
          parametersMatch(current?.desired?.parameters, parameters)
        ) {
          state.lastAppliedRevision = current.desired.revision ?? null
          state.actionMessage = '切换请求超时，但当前配置已确认保存，从下一任务开始生效'
          return current
        }
      } catch (_) {
        // 保留原始超时错误，避免用对账失败掩盖切换结果。
      }
    }

    setError(error, '切换负载均衡算法失败')
    throw error
  } finally {
    state.saving = false
  }
}

function stopPollingStatus() {
  if (pollingController) {
    pollingController.abort()
    pollingController = null
  }
  state.polling = false
}

async function waitForRevision(revision, options = {}) {
  stopPollingStatus()
  pollingController = new AbortController()
  const signal = options.signal || pollingController.signal
  const intervalMs = options.intervalMs || 2000
  const timeoutMs = options.timeoutMs || 300000
  const deadline = Date.now() + timeoutMs

  state.polling = true
  resetError()
  state.lastMatchedStatus = null

  try {
    while (Date.now() < deadline) {
      const status = await fetchExecutionStatus({ signal })

      if (
        status?.config_revision === revision &&
        TERMINAL_STATES.has(status.state)
      ) {
        state.lastMatchedStatus = status
        return status
      }

      await delay(intervalMs, signal)
    }

    return null
  } catch (error) {
    if (!isAbortError(error)) {
      setError(error, '等待负载均衡执行状态失败')
      throw error
    }
    return null
  } finally {
    state.polling = false
    if (pollingController?.signal === signal) {
      pollingController = null
    }
  }
}

const selectedAlgorithm = computed(() => findAlgorithm(state.selectedAlgorithmId))
const desired = computed(() => state.current?.desired || null)
const runtime = computed(() => state.executionStatus || state.current?.runtime || null)
const latestAssignments = computed(() => state.latestResult?.output?.assignments || [])
const latestAssignedCount = computed(() => state.latestResult?.output?.metrics?.assigned_count || {})
const loading = computed(() => (
  state.loadingAlgorithms ||
  state.loadingCurrent ||
  state.loadingStatus ||
  state.loadingResult
))

export function useLoadBalancingAlgorithmStore() {
  return {
    state,
    algorithms: computed(() => state.algorithms),
    current: computed(() => state.current),
    executionStatus: computed(() => state.executionStatus),
    latestResult: computed(() => state.latestResult),
    selectedAlgorithm,
    desired,
    runtime,
    latestAssignments,
    latestAssignedCount,
    loading,
    error: computed(() => state.error),
    actionMessage: computed(() => state.actionMessage),
    fetchAlgorithms,
    fetchCurrent,
    fetchExecutionStatus,
    fetchLatestResult,
    fetchOverview,
    selectAlgorithm,
    updateParameterDraft,
    buildParameters,
    saveSelectedAlgorithmConfig,
    switchSelectedAlgorithm,
    waitForRevision,
    stopPollingStatus
  }
}
