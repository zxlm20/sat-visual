import { computed, reactive } from 'vue'
import {
  getLoadHistory,
  getLoadNode,
  getLoadNodes,
  getLoadStatus,
  getLoadThresholds,
  updateLoadThresholds
} from '@/api/backend'

export const LOAD_LEVEL_META = {
  idle: { label: '空闲', color: '#4caf50', rank: 0 },
  smooth: { label: '流畅', color: '#7cb342', rank: 1 },
  normal: { label: '正常', color: '#2196f3', rank: 2 },
  light: { label: '轻度拥塞', color: '#ff9800', rank: 3 },
  medium: { label: '中度拥塞', color: '#f57c00', rank: 4 },
  heavy: { label: '重度拥塞', color: '#d32f2f', rank: 5 },
  offline: { label: '离线', color: '#9e9e9e', rank: 6 },
  light_congestion: { label: '轻度拥塞', color: '#ff9800', rank: 3 },
  medium_congestion: { label: '中度拥塞', color: '#f57c00', rank: 4 },
  heavy_congestion: { label: '重度拥塞', color: '#d32f2f', rank: 5 }
}

const LEVEL_ALIASES = {
  light_congestion: 'light',
  medium_congestion: 'medium',
  heavy_congestion: 'heavy'
}

const LOCAL_HISTORY_RANGE_SECONDS = 3600

const state = reactive({
  nodes: [],
  selectedNode: null,
  selectedNodeId: '',
  thresholds: null,
  history: null,
  historyNodeId: '',
  historyPhysicalNode: '',
  localHistories: {},
  loading: false,
  loadingDetail: false,
  loadingThresholds: false,
  savingThresholds: false,
  loadingHistory: false,
  error: '',
  detailError: '',
  detailNotice: '',
  thresholdsError: '',
  actionMessage: '',
  historyError: '',
  historyNotice: '',
  updateTime: null,
  source: ''
})

let nodesRequest = null
let detailToken = 0
let historyToken = 0

function optionalBoolean(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'string') {
    return ['true', '1', 'online', 'ready', 'up'].includes(value.toLowerCase())
  }
  return Boolean(value)
}

function optionalNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function canonicalLevel(level, online = null) {
  if (online === false) return 'offline'
  const raw = String(level || 'idle').toLowerCase()
  return LEVEL_ALIASES[raw] || raw
}

function logicalIds(node = {}) {
  return [node.node_id, node.logical_node_id, node.virtual_node_id]
    .filter(Boolean)
    .map(String)
}

function physicalIds(node = {}) {
  return [node.physical_node, node.physical_node_id, node.worker_node]
    .filter(Boolean)
    .map(String)
}

function normalizeComponents(value = {}) {
  return {
    cpu_percent: optionalNumber(value.cpu_percent),
    memory_percent: optionalNumber(value.memory_percent),
    disk_root_percent: optionalNumber(value.disk_root_percent),
    npu_ai_core_percent: optionalNumber(value.npu_ai_core_percent),
    npu_memory_percent: optionalNumber(value.npu_memory_percent),
    task_queue_percent: optionalNumber(value.task_queue_percent),
    availability_penalty: optionalNumber(value.availability_penalty)
  }
}

function normalizeResource(value = {}) {
  return Object.fromEntries(Object.entries(value || {}).map(([key, item]) => (
    [key, optionalNumber(item)]
  )))
}

function normalizeLoad(item = {}) {
  if (!item || typeof item !== 'object') return null
  const online = optionalBoolean(item.online)
  const level = canonicalLevel(item.level || item.load_level, online)
  const meta = LOAD_LEVEL_META[level] || LOAD_LEVEL_META.idle
  const components = normalizeComponents(item.components || item)
  const score = optionalNumber(item.score)
  return {
    ...item,
    node_id: String(item.node_id || item.logical_node_id || item.virtual_node_id || ''),
    physical_node: String(item.physical_node || item.physical_node_id || item.worker_node || ''),
    physical_ipv4: item.physical_ipv4 || '',
    score: score ?? 0,
    level,
    load_level: level,
    level_label: item.level_label || item.label || meta.label,
    label: item.level_label || item.label || meta.label,
    color: meta.color,
    components,
    resource: normalizeResource(item.resource || {}),
    online,
    k8s_ready: optionalBoolean(item.k8s_ready),
    worker_ready: optionalBoolean(item.worker_ready),
    task_queue_len: optionalNumber(item.task_queue_len),
    congestion: optionalBoolean(item.congestion),
    queue_ratio: optionalNumber(item.queue_ratio) ?? ((components.task_queue_percent ?? 0) / 100),
    recent_assigned_ratio: optionalNumber(item.recent_assigned_ratio),
    failure_ratio: optionalNumber(item.failure_ratio)
  }
}

function extractNodes(data) {
  const raw = Array.isArray(data) ? data : (data?.nodes || data?.results || data?.data || [])
  return Array.isArray(raw) ? raw.map(normalizeLoad).filter(Boolean) : []
}

function getLoadByNodeId(nodeId, physicalNode = '') {
  const logical = String(nodeId || '')
  const physical = String(physicalNode || '')
  const logicalMatch = state.nodes.find((item) => {
    if (!logical || !logicalIds(item).includes(logical)) return false
    const candidates = physicalIds(item)
    return !physical || !candidates.length || candidates.includes(physical)
  })
  if (logicalMatch) return logicalMatch
  if (!physical) return null
  return state.nodes.find((item) => (
    physicalIds(item).includes(physical) || String(item.node_id || '') === physical
  )) || null
}

function parseEpochSeconds(value) {
  const number = Number(value)
  if (Number.isFinite(number)) return Math.round(number > 1e12 ? number / 1000 : number)
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? Math.round(parsed / 1000) : Math.round(Date.now() / 1000)
}

function recordLocalSamples(nodes, timestamp) {
  const time = parseEpochSeconds(timestamp || Date.now())
  nodes.forEach((node) => {
    const aliases = [...new Set([...logicalIds(node), ...physicalIds(node)])]
    aliases.forEach((alias) => {
      const points = state.localHistories[alias] || []
      const point = {
        timestamp: time,
        score: node.score,
        level: node.level,
        components: { ...node.components }
      }
      if (points.at(-1)?.timestamp === time) points[points.length - 1] = point
      else points.push(point)
      state.localHistories[alias] = points.filter((item) => (
        item.timestamp >= time - LOCAL_HISTORY_RANGE_SECONDS
      ))
    })
  })
}

function setLoads(loads = [], envelope = {}) {
  state.nodes = loads.map(normalizeLoad).filter(Boolean)
  state.updateTime = envelope.timestamp || envelope.updated_at || Date.now()
  state.source = envelope.source || state.source
  if (envelope.thresholds) state.thresholds = envelope.thresholds
  recordLocalSamples(state.nodes, state.updateTime)
  return state.nodes
}

async function loadNodes() {
  state.loading = true
  if (!state.nodes.length) state.error = ''
  try {
    let data
    let legacyError = null
    try {
      data = await getLoadNodes()
    } catch (error) {
      legacyError = error
      data = await getLoadStatus()
    }
    setLoads(extractNodes(data), data || {})
    state.error = ''
    if (legacyError) state.detailNotice = '新版负载接口暂不可用，当前使用兼容接口数据'
    return state.nodes
  } catch (error) {
    state.error = error?.message || '获取节点负载失败'
    throw error
  } finally {
    state.loading = false
  }
}

function fetchLoadStatus() {
  if (nodesRequest) return nodesRequest
  nodesRequest = loadNodes().finally(() => { nodesRequest = null })
  return nodesRequest
}

function replaceNode(node, logicalNodeId, physicalNode) {
  const normalized = normalizeLoad(node)
  if (!normalized) return null
  if (logicalNodeId && physicalNode && normalized.node_id !== logicalNodeId) {
    normalized.reported_node_id = normalized.node_id
    normalized.node_id = logicalNodeId
    normalized.logical_node_id = logicalNodeId
    normalized.physical_node = physicalNode
  }
  const index = state.nodes.findIndex((item) => (
    (logicalNodeId && logicalIds(item).includes(logicalNodeId)) ||
    (physicalNode && physicalIds(item).includes(physicalNode))
  ))
  if (index >= 0) state.nodes[index] = { ...state.nodes[index], ...normalized }
  else state.nodes.push(normalized)
  recordLocalSamples([normalized], normalized.timestamp || Date.now())
  return index >= 0 ? state.nodes[index] : normalized
}

async function fetchLoadDetail(nodeId, physicalNode = '') {
  const token = ++detailToken
  const logical = String(nodeId || '')
  const physical = String(physicalNode || '')
  state.selectedNodeId = logical
  state.loadingDetail = true
  state.detailError = ''
  state.detailNotice = ''
  try {
    let data = null
    let logicalError = null
    try {
      data = await getLoadNode(logical)
    } catch (error) {
      logicalError = error
    }
    let node = normalizeLoad(data?.node || data?.data || data)
    if (node && physical && physicalIds(node).length && !physicalIds(node).includes(physical)) {
      logicalError = new Error(`负载响应与当前绑定 ${physical} 不一致`)
      node = null
    }
    if (!node && physical && physical !== logical) {
      data = await getLoadNode(physical)
      node = normalizeLoad(data?.node || data?.data || data)
      if (node && logicalError) {
        state.detailNotice = `已通过绑定的物理节点 ${physical} 读取负载状态`
      }
    }
    if (!node) throw logicalError || new Error('后端未返回节点负载数据')
    if (token !== detailToken) return node
    state.selectedNode = replaceNode(node, logical, physical)
    return state.selectedNode
  } catch (error) {
    if (token === detailToken) {
      const cached = getLoadByNodeId(logical, physical)
      state.selectedNode = cached
      if (cached) {
        state.detailNotice = '单节点负载接口暂不可用，当前显示最近一次成功采集的数据'
        return cached
      }
      state.detailError = error?.message || '读取单节点负载失败'
    }
    throw error
  } finally {
    if (token === detailToken) state.loadingDetail = false
  }
}

async function fetchLoadThresholds() {
  state.loadingThresholds = true
  state.thresholdsError = ''
  try {
    state.thresholds = await getLoadThresholds()
    return state.thresholds
  } catch (error) {
    state.thresholdsError = error?.message || '读取负载阈值失败'
    throw error
  } finally {
    state.loadingThresholds = false
  }
}

async function saveLoadThresholds(value) {
  state.savingThresholds = true
  state.thresholdsError = ''
  state.actionMessage = ''
  try {
    const data = await updateLoadThresholds(value)
    state.thresholds = data?.thresholds || data
    state.actionMessage = '负载评分阈值已保存，后续评分将按新配置计算'
    await fetchLoadStatus()
    return state.thresholds
  } catch (error) {
    state.thresholdsError = error?.message || '保存负载阈值失败'
    throw error
  } finally {
    state.savingThresholds = false
  }
}

function normalizeHistory(data) {
  const raw = Array.isArray(data) ? data : (data?.points || data?.samples || data?.data || [])
  const points = (Array.isArray(raw) ? raw : []).map((point) => {
    const source = Array.isArray(point) ? { timestamp: point[0], score: point[1] } : point
    const score = optionalNumber(source?.score ?? source?.value)
    if (score === null) return null
    return {
      ...source,
      timestamp: parseEpochSeconds(source?.timestamp ?? source?.time ?? source?.ts),
      score,
      level: canonicalLevel(source?.level),
      components: normalizeComponents(source?.components || {})
    }
  }).filter(Boolean).sort((a, b) => a.timestamp - b.timestamp)
  return { ...(Array.isArray(data) ? {} : data), points, source: 'backend' }
}

function localHistory(nodeId, physicalNode, rangeSeconds, stepSeconds) {
  const alias = String(physicalNode || nodeId || '')
  const source = state.localHistories[alias] || []
  if (!source.length) return null
  const end = source.at(-1).timestamp
  const buckets = new Map()
  source.filter((point) => point.timestamp >= end - rangeSeconds).forEach((point) => {
    buckets.set(Math.floor(point.timestamp / stepSeconds) * stepSeconds, point)
  })
  const points = [...buckets.values()]
  return { node: nodeId, physical_node: physicalNode, points, source: 'local', step: stepSeconds }
}

async function fetchLoadHistory(nodeId, physicalNode = '', rangeSeconds = 3600, stepSeconds = 60) {
  const token = ++historyToken
  const logical = String(nodeId || '')
  const physical = String(physicalNode || '')
  const safeRange = Math.min(86400, Math.max(60, Math.round(Number(rangeSeconds) || 3600)))
  const safeStep = Math.min(3600, Math.max(15, Math.round(Number(stepSeconds) || 60)))
  const sameTarget = state.historyNodeId === logical && state.historyPhysicalNode === physical
  state.historyNodeId = logical
  state.historyPhysicalNode = physical
  state.loadingHistory = true
  state.historyError = ''
  state.historyNotice = ''
  if (!sameTarget) state.history = null
  try {
    let history = null
    let firstError = null
    try {
      history = normalizeHistory(await getLoadHistory(logical, safeRange, safeStep))
    } catch (error) {
      firstError = error
    }
    if (!history?.points.length && physical && physical !== logical) {
      try {
        history = normalizeHistory(await getLoadHistory(physical, safeRange, safeStep))
        if (history.points.length) state.historyNotice = `历史负载已通过物理节点 ${physical} 查询`
      } catch (error) {
        if (!firstError) firstError = error
      }
    }
    if (!history?.points.length) {
      history = localHistory(logical, physical, safeRange, safeStep)
      if (history?.points.length) state.historyNotice = '后端历史暂不可用，显示本页打开后的本地滚动采样'
    }
    if (!history?.points.length) throw firstError || new Error('暂无历史负载采样')
    if (token === historyToken) state.history = history
    return history
  } catch (error) {
    if (token === historyToken) {
      state.historyError = error?.message || '读取负载历史失败'
    }
    throw error
  } finally {
    if (token === historyToken) state.loadingHistory = false
  }
}

function clearSelectedLoad() {
  detailToken += 1
  historyToken += 1
  state.selectedNode = null
  state.selectedNodeId = ''
  state.history = null
  state.historyNodeId = ''
  state.historyPhysicalNode = ''
  state.loadingDetail = false
  state.loadingHistory = false
  state.detailError = ''
  state.detailNotice = ''
  state.historyError = ''
  state.historyNotice = ''
}

export function useLoadStore() {
  return {
    state,
    levels: LOAD_LEVEL_META,
    nodes: computed(() => state.nodes),
    loading: computed(() => state.loading),
    error: computed(() => state.error),
    setLoads,
    fetchLoadStatus,
    fetchLoadDetail,
    fetchLoadThresholds,
    saveLoadThresholds,
    fetchLoadHistory,
    getLoadByNodeId,
    clearSelectedLoad
  }
}
