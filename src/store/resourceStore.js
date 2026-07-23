import { computed, reactive } from 'vue'
import {
  getNodeResource,
  getNodeResources,
  getResourceHistory,
  getResourceMetrics,
  getResourceStatus
} from '@/api/backend'

const BASE_HISTORY_METRICS = [
  'cpu_percent',
  'memory_percent',
  'disk_root_percent'
]

const NPU_HISTORY_METRICS = [
  'npu_ai_core_percent',
  'npu_ai_cpu_percent',
  'npu_control_cpu_percent',
  'npu_memory_percent',
  'npu_memory_bandwidth_percent',
  'npu_memory_used_bytes',
  'npu_temperature_celsius',
  'npu_power_watts',
  'npu_health_ok',
  'npu_collector_success'
]

const LOCAL_HISTORY_METRICS = [...BASE_HISTORY_METRICS, ...NPU_HISTORY_METRICS]

const LOCAL_HISTORY_RANGE_SECONDS = 3600

const state = reactive({
  status: null,
  metrics: [],
  metricsCurrent: [],
  metricsHistory: [],
  metricsNote: '',
  nodes: [],
  selectedNode: null,
  selectedNodeId: '',
  histories: {},
  historyNodeId: '',
  loadingStatus: false,
  loadingNodes: false,
  loadingDetail: false,
  loadingHistory: false,
  error: '',
  serviceError: '',
  nodesError: '',
  detailError: '',
  detailNotice: '',
  historyError: '',
  historyNotice: '',
  historyPhysicalNode: '',
  historyRangeSeconds: 3600,
  historyStepSeconds: 60,
  localHistories: {},
  updateTime: null,
  source: ''
})

let nodeResourcesRequest = null
let resourceServiceRequest = null
let detailRequestToken = 0
let historyRequestToken = 0
let detailMutationVersion = 0

function toBoolean(value) {
  if (typeof value === 'string') {
    return ['true', '1', 'up', 'online', 'ready'].includes(value.toLowerCase())
  }
  return Boolean(value)
}

function normalizeTarget(target = {}) {
  const upValue = target.up ?? target.online ?? target.ready ?? target.value
  return {
    ...target,
    node: target.node || target.node_id || target.name || '',
    instance: target.instance || target.address || target.target || '',
    up: normalizeOptionalBoolean(upValue)
  }
}

function normalizeStatus(data) {
  const source = data?.status && typeof data.status === 'object'
    ? { ...data, ...data.status }
    : (data || {})
  const targets = source.node_exporter_targets || source.targets || source.exporter_targets || []
  const npuCollectors = source.npu_collectors || source.npu_targets || []
  const readyValue = source.ready ?? source.prometheus_ready ?? source.available
  const statusValue = String(source.status || '').toLowerCase()
  const normalizedReady = readyValue === undefined
    ? (statusValue ? ['ok', 'ready', 'healthy'].includes(statusValue) : null)
    : toBoolean(readyValue)
  return {
    ...source,
    ready: normalizedReady,
    node_exporter_targets: Array.isArray(targets) ? targets.map(normalizeTarget) : [],
    npu_collectors: Array.isArray(npuCollectors) ? npuCollectors.map(normalizeTarget) : []
  }
}

function normalizeMetricNames(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String)
  if (value && typeof value === 'object') return Object.keys(value)
  return []
}

function extractMetricCatalog(data) {
  if (Array.isArray(data)) {
    const current = normalizeMetricNames(data)
    return { current, history: [], all: current, note: '' }
  }
  const legacyMetrics = data?.metrics || data?.available_metrics || data?.metric_names
  const current = normalizeMetricNames(data?.current || legacyMetrics)
  const history = normalizeMetricNames(data?.history || data?.history_metrics)
  return {
    current,
    history,
    all: [...new Set([...current, ...history])],
    note: String(data?.npu_note || data?.note || '')
  }
}

function normalizeResourceNode(node) {
  if (!node || typeof node !== 'object') return null
  const metrics = node.metrics || node.resources || node.resource_metrics || {}
  const status = node.status && typeof node.status === 'object' ? node.status : {}
  const online = normalizeOptionalBoolean(node.online ?? node.up ?? status.online)
  const merged = { ...node, ...metrics }
  return {
    ...merged,
    online,
    k8s_ready: normalizeOptionalBoolean(node.k8s_ready ?? status.k8s_ready),
    worker_ready: normalizeOptionalBoolean(node.worker_ready ?? status.worker_ready),
    npu_expected: normalizeOptionalBoolean(merged.npu_expected),
    npu_metrics_available: normalizeOptionalBoolean(merged.npu_metrics_available),
    npu_metrics_stale: normalizeOptionalBoolean(merged.npu_metrics_stale),
    npu_collector_success: normalizeNpuFlag(merged.npu_collector_success),
    npu_health_ok: normalizeNpuFlag(merged.npu_health_ok),
    task_queue_len: node.task_queue_len ?? status.task_queue_len,
    alarm_level: deriveAlarmLevel(merged, status, online)
  }
}

function normalizeOptionalBoolean(value) {
  return value === null || value === undefined ? value : toBoolean(value)
}

function normalizeNpuFlag(value) {
  if (value === null || value === undefined || value === '') return value
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric >= 1 : toBoolean(value)
}

function deriveAlarmLevel(node, status, online) {
  if (online === false) return 'offline'
  const explicit = String(node.alarm_level || status.alarm_level || '').toLowerCase()
  const percentages = [
    node.cpu_percent,
    node.memory_percent,
    node.disk_root_percent,
    node.npu_ai_core_percent,
    node.npu_memory_percent
  ].filter((value) => (
    value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
  )).map(Number)
  const npuHealthOk = normalizeNpuFlag(node.npu_health_ok)
  const npuTemperature = Number(node.npu_temperature_celsius)
  if (
    npuHealthOk === false ||
    (Number.isFinite(npuTemperature) && npuTemperature >= 90) ||
    percentages.some((value) => value >= 90) ||
    explicit === 'critical'
  ) return 'critical'
  const npuExpected = normalizeOptionalBoolean(node.npu_expected)
  const npuUnavailable = npuExpected === true && (
    normalizeOptionalBoolean(node.npu_metrics_available) !== true ||
    normalizeNpuFlag(node.npu_collector_success) === false ||
    normalizeOptionalBoolean(node.npu_metrics_stale) === true
  )
  if (
    npuUnavailable ||
    (Number.isFinite(npuTemperature) && npuTemperature >= 80) ||
    percentages.some((value) => value >= 75) ||
    explicit === 'warning'
  ) return 'warning'
  if (explicit === 'offline') return 'offline'
  return 'normal'
}

function extractResourceNodes(data) {
  const nodes = Array.isArray(data)
    ? data
    : (data?.nodes || data?.resources || data?.results || data?.data || [])
  return Array.isArray(nodes) ? nodes.map(normalizeResourceNode).filter(Boolean) : []
}

function extractResourceNode(data) {
  return normalizeResourceNode(data?.node || data?.resource || data?.data || data)
}

function getLogicalIds(node = {}) {
  return [node.node_id, node.logical_node_id, node.virtual_node_id]
    .filter(Boolean)
    .map(String)
}

function getPhysicalIds(node = {}) {
  return [node.physical_node, node.physical_node_id, node.worker_node, node.node]
    .filter(Boolean)
    .map(String)
}

function hasPhysicalBindingMismatch(node, expectedPhysicalNode) {
  const expected = String(expectedPhysicalNode || '')
  if (!expected || !node) return false
  const explicitPhysicalIds = [node.physical_node, node.physical_node_id, node.worker_node]
    .filter(Boolean)
    .map(String)
  return explicitPhysicalIds.length > 0 && !explicitPhysicalIds.includes(expected)
}

function findResourceIndex(nodes, node) {
  if (!node) return -1
  const logicalIds = getLogicalIds(node)
  if (logicalIds.length) {
    const logicalIndex = nodes.findIndex((item) => (
      getLogicalIds(item).some((id) => logicalIds.includes(id))
    ))
    if (logicalIndex >= 0) return logicalIndex
    return -1
  }
  const physicalIds = getPhysicalIds(node)
  return nodes.findIndex((item) => (
    getPhysicalIds(item).some((id) => physicalIds.includes(id))
  ))
}

function findResourceIndexForBinding(nodes, logicalNodeId = '', physicalNodeId = '') {
  const logicalId = String(logicalNodeId || '')
  const physicalId = String(physicalNodeId || '')
  if (logicalId) {
    const logicalIndex = nodes.findIndex((item) => getLogicalIds(item).includes(logicalId))
    if (logicalIndex >= 0) return logicalIndex
  }
  if (!physicalId) return -1
  return nodes.findIndex((item) => (
    getPhysicalIds(item).includes(physicalId) || String(item?.node_id || '') === physicalId
  ))
}

function replaceResourceNode(node, binding = {}) {
  if (!node) return
  const logicalNodeId = String(binding.logicalNodeId || '')
  const physicalNodeId = String(binding.physicalNodeId || '')
  const bindingIndex = findResourceIndexForBinding(state.nodes, logicalNodeId, physicalNodeId)
  const index = bindingIndex >= 0 ? bindingIndex : findResourceIndex(state.nodes, node)
  const existing = index >= 0 ? state.nodes[index] : {}
  const merged = { ...existing, ...node }

  // A physical-node fallback can return the physical hostname in node_id. Keep
  // the selected virtual node as the canonical id so the row is updated instead
  // of creating a second, stale resource record.
  if (logicalNodeId && physicalNodeId) {
    if (node.node_id && String(node.node_id) !== logicalNodeId) {
      merged.reported_node_id = node.node_id
    }
    merged.node_id = logicalNodeId
    merged.logical_node_id = logicalNodeId
    merged.virtual_node_id = logicalNodeId
    merged.physical_node = physicalNodeId
  }

  if (index >= 0) state.nodes[index] = merged
  else state.nodes.push(merged)
  return merged
}

function parseEpochSeconds(value) {
  const numeric = Number(value)
  if (Number.isFinite(numeric)) return Math.round(numeric > 1000000000000 ? numeric / 1000 : numeric)
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? Math.round(parsed / 1000) : null
}

function toEpochSeconds(value) {
  return parseEpochSeconds(value) ?? Math.round(Date.now() / 1000)
}

function localHistoryKey(alias, metric) {
  return `${String(alias)}::${metric}`
}

function appendLocalPoint(alias, metric, timestamp, value) {
  if (!alias || value === null || value === undefined || value === '') return
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return
  const key = localHistoryKey(alias, metric)
  const points = state.localHistories[key] || []
  const nextPoint = { timestamp, value: numericValue }
  if (points.length && points[points.length - 1].timestamp === timestamp) {
    points[points.length - 1] = nextPoint
  } else {
    points.push(nextPoint)
  }
  const cutoff = timestamp - LOCAL_HISTORY_RANGE_SECONDS
  state.localHistories[key] = points.filter((point) => point.timestamp >= cutoff)
}

function getLocalHistoryPoints(nodeId, physicalNode, metric, rangeSeconds = 3600, stepSeconds = 60) {
  // Resource metrics describe the bound physical machine. After re-binding a
  // virtual node, never mix samples retained under its old physical binding.
  const alias = String(physicalNode || nodeId || '')
  const source = alias ? (state.localHistories[localHistoryKey(alias, metric)] || []) : []
  if (!source.length) return []
  const end = source[source.length - 1].timestamp
  const cutoff = end - rangeSeconds
  const buckets = new Map()
  source.filter((point) => point.timestamp >= cutoff).forEach((point) => {
    const bucket = Math.floor(point.timestamp / stepSeconds) * stepSeconds
    buckets.set(bucket, point)
  })
  return [...buckets.values()].sort((left, right) => left.timestamp - right.timestamp)
}

function refreshActiveLocalHistories() {
  if (!state.historyNodeId) return
  let refreshedCount = 0
  Object.entries(state.histories).forEach(([metric, history]) => {
    if (!['local', 'unavailable'].includes(history?.source)) return
    const points = getLocalHistoryPoints(
      state.historyNodeId,
      state.historyPhysicalNode,
      metric,
      state.historyRangeSeconds,
      state.historyStepSeconds
    )
    if (!points.length) return
    refreshedCount += 1
    state.histories[metric] = {
      ...history,
      node: state.historyNodeId,
      physical_node: state.historyPhysicalNode,
      start: points[0].timestamp,
      end: points[points.length - 1].timestamp,
      step: state.historyStepSeconds,
      points,
      source: 'local'
    }
  })
  if (refreshedCount) {
    const unavailableCount = Object.values(state.histories)
      .filter((history) => history?.source === 'unavailable').length
    if (!unavailableCount) state.historyError = ''
    state.historyNotice = `${refreshedCount} 项正在显示本页打开后的本地滚动采样`
  }
}

function recordLocalSamples(nodes, timestamp) {
  const sampleTime = toEpochSeconds(timestamp || Date.now())
  nodes.forEach((node) => {
    const aliases = [...new Set([...getLogicalIds(node), ...getPhysicalIds(node)])]
    LOCAL_HISTORY_METRICS.forEach((metric) => {
      aliases.forEach((alias) => appendLocalPoint(alias, metric, sampleTime, node[metric]))
    })
  })
  refreshActiveLocalHistories()
}

function syncError() {
  state.error = state.nodesError || state.serviceError
}

async function loadResourceService() {
  state.loadingStatus = true
  state.serviceError = ''
  syncError()
  try {
    const [statusResult, metricsResult] = await Promise.allSettled([
      getResourceStatus(),
      getResourceMetrics()
    ])
    if (statusResult.status === 'fulfilled') state.status = normalizeStatus(statusResult.value)
    if (metricsResult.status === 'fulfilled') {
      const catalog = extractMetricCatalog(metricsResult.value)
      state.metrics = catalog.all
      state.metricsCurrent = catalog.current
      state.metricsHistory = catalog.history
      state.metricsNote = catalog.note
    }
    const failure = [statusResult, metricsResult].find((item) => item.status === 'rejected')
    if (failure) throw failure.reason
    return { status: state.status, metrics: state.metrics }
  } catch (error) {
    state.serviceError = error?.message || '读取资源监控服务状态失败'
    syncError()
    throw error
  } finally {
    state.loadingStatus = false
  }
}

function fetchResourceService() {
  if (resourceServiceRequest) return resourceServiceRequest
  resourceServiceRequest = loadResourceService().finally(() => {
    resourceServiceRequest = null
  })
  return resourceServiceRequest
}

async function loadNodeResources() {
  const detailVersionAtStart = detailMutationVersion
  state.loadingNodes = true
  if (!state.nodes.length) {
    state.nodesError = ''
    syncError()
  }
  try {
    const data = await getNodeResources()
    const nodes = extractResourceNodes(data)
    recordLocalSamples(nodes, data?.timestamp || data?.updated_at)
    if (detailVersionAtStart !== detailMutationVersion && state.selectedNode) {
      const selectedIndex = findResourceIndexForBinding(
        nodes,
        state.selectedNodeId || state.selectedNode.node_id,
        state.selectedNode.physical_node || state.historyPhysicalNode
      )
      if (selectedIndex >= 0) nodes[selectedIndex] = { ...nodes[selectedIndex], ...state.selectedNode }
      else nodes.push(state.selectedNode)
    }
    state.nodes = nodes
    state.nodesError = ''
    state.updateTime = data?.timestamp || data?.updated_at || Date.now()
    state.source = data?.source || ''
    syncError()
    return state.nodes
  } catch (error) {
    state.nodesError = error?.message || '读取节点资源状态失败'
    syncError()
    throw error
  } finally {
    state.loadingNodes = false
  }
}

function fetchNodeResources() {
  if (nodeResourcesRequest) return nodeResourcesRequest
  nodeResourcesRequest = loadNodeResources().finally(() => {
    nodeResourcesRequest = null
  })
  return nodeResourcesRequest
}

function getResourceByNode(nodeId, physicalNode = '') {
  const logicalId = String(nodeId || '')
  const physicalId = String(physicalNode || '')
  const logicalMatch = state.nodes.find((node) => {
    if (!logicalId || !getLogicalIds(node).includes(logicalId)) return false
    const candidatePhysicalIds = getPhysicalIds(node)
    return !physicalId || !candidatePhysicalIds.length || candidatePhysicalIds.includes(physicalId)
  })
  if (logicalMatch) return logicalMatch
  if (!physicalId) return null
  return state.nodes.find((node) => (
    getPhysicalIds(node).includes(physicalId) || String(node.node_id || '') === physicalId
  )) || null
}

async function fetchResourceDetail(nodeId, physicalNode = '') {
  const requestToken = ++detailRequestToken
  const requestNodeId = String(nodeId || '')
  const fallbackPhysicalNode = String(physicalNode || '')
  state.selectedNodeId = requestNodeId
  state.loadingDetail = true
  state.detailError = ''
  state.detailNotice = ''
  try {
    let data = null
    let firstError = null
    let queryNode = requestNodeId
    try {
      data = await getNodeResource(requestNodeId)
    } catch (error) {
      firstError = error
    }

    let node = extractResourceNode(data)
    if (node && hasPhysicalBindingMismatch(node, fallbackPhysicalNode)) {
      firstError = new Error(
        `逻辑节点返回的物理节点与当前绑定 ${fallbackPhysicalNode} 不一致`
      )
      node = null
    }

    if (!node && fallbackPhysicalNode && fallbackPhysicalNode !== requestNodeId) {
      queryNode = fallbackPhysicalNode
      try {
        data = await getNodeResource(fallbackPhysicalNode)
        node = extractResourceNode(data)
      } catch (error) {
        if (firstError) {
          throw new Error(`${firstError.message}；物理节点查询失败：${error?.message || '未知错误'}`)
        }
        throw error
      }
    }

    if (!node) throw firstError || new Error('后端未返回节点资源数据')
    if (hasPhysicalBindingMismatch(node, fallbackPhysicalNode)) {
      throw new Error(`资源响应与当前物理节点绑定 ${fallbackPhysicalNode} 不一致`)
    }
    if (requestToken === detailRequestToken) {
      const selectedNode = replaceResourceNode(node, {
        logicalNodeId: requestNodeId,
        physicalNodeId: fallbackPhysicalNode
      }) || node
      recordLocalSamples([selectedNode], selectedNode.timestamp || Date.now())
      detailMutationVersion += 1
      state.selectedNode = selectedNode
      if (firstError) state.detailNotice = `逻辑节点查询暂不可用，已通过物理节点 ${queryNode} 读取资源`
      return selectedNode
    }
    return node
  } catch (error) {
    if (requestToken === detailRequestToken) {
      const cachedNode = getResourceByNode(requestNodeId, fallbackPhysicalNode)
      state.selectedNode = cachedNode
      if (cachedNode) {
        state.detailError = ''
        state.detailNotice = '单节点实时接口暂不可用，当前显示最近一次成功采集的数据'
        return cachedNode
      }
      state.detailError = error?.message || '读取单节点资源失败'
    }
    throw error
  } finally {
    if (requestToken === detailRequestToken) state.loadingDetail = false
  }
}

function normalizeHistory(data, metric) {
  const rawPoints = Array.isArray(data)
    ? data
    : (data?.points || data?.samples || data?.values || data?.data || [])
  const pointsByTimestamp = new Map()
  if (Array.isArray(rawPoints)) {
    rawPoints.forEach((point) => {
      const rawTimestamp = Array.isArray(point)
        ? point[0]
        : (point?.timestamp ?? point?.time ?? point?.ts)
      const rawValue = Array.isArray(point) ? point[1] : (point?.value ?? point?.metric_value)
      if (rawTimestamp === null || rawTimestamp === undefined || rawTimestamp === '') return
      if (rawValue === null || rawValue === undefined || rawValue === '') return
      const value = Number(rawValue)
      if (!Number.isFinite(value)) return
      const timestamp = parseEpochSeconds(rawTimestamp)
      if (timestamp === null) return
      pointsByTimestamp.set(timestamp, { timestamp, value })
    })
  }
  const points = [...pointsByTimestamp.values()].sort((left, right) => left.timestamp - right.timestamp)
  return { ...(Array.isArray(data) ? {} : data), metric, points, source: 'backend' }
}

async function fetchHistoryMetric(
  nodeId,
  physicalNode,
  metric,
  rangeSeconds,
  stepSeconds
) {
  let firstError = null
  try {
    const data = await getResourceHistory(nodeId, metric, rangeSeconds, stepSeconds)
    const history = normalizeHistory(data, metric)
    if (history.points.length && !hasPhysicalBindingMismatch(history, physicalNode)) return history
    if (history.points.length) {
      firstError = new Error(`历史响应与当前物理节点绑定 ${physicalNode} 不一致`)
    }
  } catch (error) {
    firstError = error
  }

  if (physicalNode && physicalNode !== nodeId) {
    try {
      const data = await getResourceHistory(physicalNode, metric, rangeSeconds, stepSeconds)
      const history = normalizeHistory(data, metric)
      if (history.points.length && !hasPhysicalBindingMismatch(history, physicalNode)) {
        return { ...history, query_node: physicalNode, logical_query_error: firstError?.message || '' }
      }
      if (history.points.length && !firstError) {
        firstError = new Error(`历史响应与当前物理节点绑定 ${physicalNode} 不一致`)
      }
    } catch (error) {
      if (!firstError) firstError = error
    }
  }

  const localPoints = getLocalHistoryPoints(
    nodeId,
    physicalNode,
    metric,
    rangeSeconds,
    stepSeconds
  )
  if (localPoints.length) {
    return {
      node: nodeId,
      physical_node: physicalNode,
      metric,
      start: localPoints[0].timestamp,
      end: localPoints[localPoints.length - 1].timestamp,
      step: stepSeconds,
      points: localPoints,
      source: 'local',
      fallback_error: firstError?.message || ''
    }
  }

  const unavailable = new Error(firstError?.message || `${metric} 暂无历史采样`)
  unavailable.history = {
    node: nodeId,
    physical_node: physicalNode,
    metric,
    step: stepSeconds,
    points: [],
    source: 'unavailable'
  }
  throw unavailable
}

async function fetchResourceHistories(
  nodeId,
  physicalNode = '',
  metrics = null,
  rangeSeconds = 3600,
  stepSeconds = 60
) {
  const requestToken = ++historyRequestToken
  const requestNodeId = String(nodeId || '')
  const requestPhysicalNode = String(physicalNode || '')
  const safeRangeSeconds = Math.min(86400, Math.max(1, Math.round(Number(rangeSeconds) || 3600)))
  const safeStepSeconds = Math.min(
    safeRangeSeconds,
    Math.max(1, Math.round(Number(stepSeconds) || 60))
  )
  const sameTarget = state.historyNodeId === requestNodeId &&
    state.historyPhysicalNode === requestPhysicalNode
  const previousHistories = sameTarget ? state.histories : {}
  const resource = getResourceByNode(requestNodeId, requestPhysicalNode) || state.selectedNode
  const hasNpuData = NPU_HISTORY_METRICS.some((metric) => (
    resource?.[metric] !== null && resource?.[metric] !== undefined && resource?.[metric] !== ''
  ))
  const requestedMetrics = Array.isArray(metrics) && metrics.length
    ? metrics
    : [...BASE_HISTORY_METRICS, ...((resource?.npu_expected === true || hasNpuData) ? NPU_HISTORY_METRICS : [])]
  state.historyNodeId = requestNodeId
  state.historyPhysicalNode = requestPhysicalNode
  state.historyRangeSeconds = safeRangeSeconds
  state.historyStepSeconds = safeStepSeconds
  state.loadingHistory = true
  if (!sameTarget) {
    state.historyError = ''
    state.historyNotice = ''
    state.histories = {}
  }
  try {
    const results = await Promise.allSettled(requestedMetrics.map((metric) => (
      fetchHistoryMetric(
        requestNodeId,
        requestPhysicalNode,
        metric,
        safeRangeSeconds,
        safeStepSeconds
      )
    )))
    const histories = {}
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        histories[requestedMetrics[index]] = result.value
      } else {
        const previousHistory = previousHistories[requestedMetrics[index]]
        histories[requestedMetrics[index]] = previousHistory?.points?.length ? {
          ...previousHistory,
          stale: true,
          fallback_error: result.reason?.message || ''
        } : (result.reason?.history || {
          node: requestNodeId,
          physical_node: requestPhysicalNode,
          metric: requestedMetrics[index],
          step: safeStepSeconds,
          points: [],
          source: 'unavailable'
        })
      }
    })
    const failures = results.filter((result) => result.status === 'rejected')
    const localCount = Object.values(histories).filter((history) => history.source === 'local').length
    const staleCount = Object.values(histories).filter((history) => history.stale).length
    const physicalFallbackCount = Object.values(histories).filter((history) => history.query_node).length
    if (requestToken === historyRequestToken) {
      state.histories = histories
      state.historyError = failures.length
        ? `${failures.length} 项历史指标暂时不可用：${failures[0].reason?.message || '后端未返回数据'}`
        : ''
      const notices = []
      if (localCount) notices.push(`${localCount} 项正在显示本页打开后的本地滚动采样`)
      if (staleCount) notices.push(`${staleCount} 项保留上次成功获取的历史数据`)
      if (physicalFallbackCount) notices.push(`${physicalFallbackCount} 项已通过物理节点名查询`)
      state.historyNotice = notices.join('；')
    }
    return histories
  } finally {
    if (requestToken === historyRequestToken) state.loadingHistory = false
  }
}

function clearSelectedResource() {
  detailRequestToken += 1
  historyRequestToken += 1
  state.selectedNode = null
  state.selectedNodeId = ''
  state.histories = {}
  state.historyNodeId = ''
  state.loadingDetail = false
  state.loadingHistory = false
  state.detailError = ''
  state.detailNotice = ''
  state.historyError = ''
  state.historyNotice = ''
  state.historyPhysicalNode = ''
}

export function useResourceStore() {
  return {
    state,
    nodes: computed(() => state.nodes),
    fetchResourceService,
    fetchNodeResources,
    fetchResourceDetail,
    fetchResourceHistories,
    getResourceByNode,
    clearSelectedResource
  }
}
