const API_BASE_URL = process.env.VUE_APP_API_BASE_URL || ''
const REQUEST_TIMEOUT_MS = 8000

function joinUrl(baseUrl, path) {
  if (!baseUrl) return path
  return `${baseUrl.replace(/\/$/, '')}${path}`
}

function getWsBaseUrl() {
  if (!API_BASE_URL) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}`
  }

  return API_BASE_URL
    .replace(/^https:/, 'wss:')
    .replace(/^http:/, 'ws:')
    .replace(/\/$/, '')
}

async function fetchJson(path, options = {}) {
  const { timeoutMs = REQUEST_TIMEOUT_MS, ...fetchOptions } = options
  const controller = new AbortController()
  const timeoutError = new Error(`请求超时（${Math.ceil(timeoutMs / 1000)} 秒）：${path.split('?')[0]}`)
  timeoutError.name = 'RequestTimeoutError'
  const timer = setTimeout(() => {
    if (!controller.signal.aborted) controller.abort(timeoutError)
  }, timeoutMs)

  try {
    const response = await fetch(joinUrl(API_BASE_URL, path), {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(fetchOptions.headers || {})
      }
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
      const detailText = Array.isArray(detail)
        ? detail.map((item) => item?.msg || JSON.stringify(item)).join('；')
        : (typeof detail === 'object' && detail !== null ? JSON.stringify(detail) : detail)
      throw new Error(detailText || `请求失败：HTTP ${response.status}`)
    }

    return data
  } catch (error) {
    if (controller.signal.aborted) throw timeoutError
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export function getApiBaseUrl() {
  return API_BASE_URL || '同源 /api'
}

export function getStatusWsUrl() {
  return `${getWsBaseUrl()}/ws/status`
}

export async function checkBackendHealth() {
  const data = await fetchJson('/api/health')
  const backendOk = data?.status === 'ok'
  const k8sOk = data?.runtime?.k8s?.available !== false

  if (!backendOk || !k8sOk) {
    throw new Error('后端或 Kubernetes 集群状态异常')
  }

  return data
}

export async function getNodes() {
  return fetchJson('/api/nodes')
}

export async function getNodeDetail(nodeId) {
  return fetchJson(`/api/nodes/${encodeURIComponent(nodeId)}`)
}

export async function getJobs(limit = 20) {
  return fetchJson(`/api/jobs?limit=${encodeURIComponent(limit)}`)
}

export async function getJobDetail(jobId) {
  return fetchJson(`/api/jobs/${encodeURIComponent(jobId)}`)
}

export async function getJobTiles(jobId) {
  return fetchJson(`/api/jobs/${encodeURIComponent(jobId)}/tiles`)
}

export async function getLoadStatus() {
  return fetchJson('/api/load/status')
}

export async function getLoadNodes() {
  return fetchJson('/api/load/nodes', { timeoutMs: 15000 })
}

export async function getLoadNode(nodeId) {
  return fetchJson(`/api/load/nodes/${encodeURIComponent(nodeId)}`, {
    timeoutMs: 15000
  })
}

export async function getLoadThresholds() {
  return fetchJson('/api/load/thresholds', { timeoutMs: 15000 })
}

export async function updateLoadThresholds(thresholds) {
  return fetchJson('/api/load/thresholds', {
    method: 'PUT',
    timeoutMs: 20000,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(thresholds)
  })
}

export async function getLoadHistory(nodeId, rangeSeconds = 3600, stepSeconds = 60) {
  const parsedRange = Number(rangeSeconds)
  const safeRange = Math.min(
    86400,
    Math.max(60, Number.isFinite(parsedRange) ? Math.round(parsedRange) : 3600)
  )
  const parsedStep = Number(stepSeconds)
  const safeStep = Math.min(
    3600,
    Math.max(15, Number.isFinite(parsedStep) ? Math.round(parsedStep) : 60)
  )
  const params = new URLSearchParams({
    node: nodeId,
    range_seconds: String(safeRange),
    step_seconds: String(safeStep)
  })
  return fetchJson(`/api/load/history?${params.toString()}`, { timeoutMs: 20000 })
}

function buildTopologyQuery(options = {}) {
  const params = new URLSearchParams()
  if (options.timeIndex !== undefined && options.timeIndex !== null) {
    params.set('time_index', String(Math.max(0, Math.round(Number(options.timeIndex) || 0))))
  }
  if (options.orbitLayer) params.set('orbit_layer', options.orbitLayer)
  if (options.includeSimulatedLinks !== undefined) {
    params.set('include_simulated_links', String(Boolean(options.includeSimulatedLinks)))
  }
  if (options.includeTrajectories !== undefined) {
    params.set('include_trajectories', String(Boolean(options.includeTrajectories)))
  }
  if (options.trajectoryStride !== undefined) {
    params.set('trajectory_stride', String(Math.max(1, Math.round(Number(options.trajectoryStride) || 120))))
  }
  if (options.trajectoryLimit !== undefined) {
    params.set('trajectory_limit', String(Math.max(1, Math.round(Number(options.trajectoryLimit) || 300))))
  }
  const query = params.toString()
  return query ? `?${query}` : ''
}

export async function getTopology2d(options = {}) {
  return fetchJson(`/api/topology/2d${buildTopologyQuery(options)}`, { timeoutMs: 20000 })
}

export async function getTopology3d(options = {}) {
  return fetchJson(`/api/topology/3d${buildTopologyQuery(options)}`, { timeoutMs: 30000 })
}

export async function getTopologyLinks(options = {}) {
  return fetchJson(`/api/topology/links${buildTopologyQuery(options)}`, { timeoutMs: 20000 })
}

export async function getLoadBalancePolicies() {
  return fetchJson('/api/lb/policies')
}

export async function getCurrentLoadBalance() {
  return fetchJson('/api/lb/current')
}

const EPHEMERIS_PATH = '/shared/ephemeris/Allsat_J2000_Position_Velocity.csv'

export async function getConstellationStatus() {
  return fetchJson('/api/constellations/status', { timeoutMs: 15000 })
}

export async function loadConstellationEphemeris() {
  return fetchJson('/api/constellations/load', {
    method: 'POST',
    timeoutMs: 60000,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ephemeris_path: EPHEMERIS_PATH,
      meo_type: 'MEO',
      heo_type: 'HEO'
    })
  })
}

export async function getConstellationNodes(layer = '') {
  const query = layer ? `?layer=${encodeURIComponent(layer)}` : ''
  return fetchJson(`/api/constellations/nodes${query}`, { timeoutMs: 20000 })
}

export async function getConstellationNodeDetail(nodeId) {
  return fetchJson(`/api/constellations/nodes/${encodeURIComponent(nodeId)}`, {
    timeoutMs: 15000
  })
}

export async function getConstellationPositions(timeIndex = 0, layer = '') {
  const params = new URLSearchParams({ time_index: String(timeIndex) })
  if (layer) params.set('layer', layer)
  return fetchJson(`/api/constellations/positions?${params.toString()}`, {
    timeoutMs: 20000
  })
}

export async function getConstellationTrajectory(nodeId, stride = 1, limit = 1441) {
  const params = new URLSearchParams({
    stride: String(stride),
    limit: String(limit)
  })
  return fetchJson(
    `/api/constellations/nodes/${encodeURIComponent(nodeId)}/trajectory?${params.toString()}`,
    { timeoutMs: 60000 }
  )
}

export async function syncNodeModels(overwrite = false, bindDemoWorkers = true) {
  return fetchJson('/api/node-models/sync-from-constellation', {
    method: 'POST',
    timeoutMs: 60000,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      overwrite,
      bind_demo_workers: bindDemoWorkers
    })
  })
}

export async function getNodeModels(filters = {}) {
  const params = new URLSearchParams()
  if (filters.orbitLayer) params.set('orbit_layer', filters.orbitLayer)
  if (filters.nodeType) params.set('node_type', filters.nodeType)
  const query = params.toString()
  return fetchJson(`/api/node-models${query ? `?${query}` : ''}`, { timeoutMs: 20000 })
}

export async function getNodeModel(nodeId) {
  return fetchJson(`/api/node-models/${encodeURIComponent(nodeId)}`, { timeoutMs: 15000 })
}

export async function updateNodeModel(nodeId, patch) {
  return fetchJson(`/api/node-models/${encodeURIComponent(nodeId)}`, {
    method: 'PATCH',
    timeoutMs: 20000,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch)
  })
}

export async function getIpPools() {
  return fetchJson('/api/ip-pools', { timeoutMs: 15000 })
}

export async function updateIpPool(layer, ipv4Cidr, ipv6Cidr) {
  return fetchJson('/api/ip-pools', {
    method: 'POST',
    timeoutMs: 20000,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      layer,
      ipv4_cidr: ipv4Cidr,
      ipv6_cidr: ipv6Cidr
    })
  })
}

export async function checkIpAllocation({ ip, nodeId, layer }) {
  return fetchJson('/api/ip-allocations/check', {
    method: 'POST',
    timeoutMs: 15000,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ip, node_id: nodeId, layer })
  })
}

export async function allocateNodeIp(nodeId, overwrite = true) {
  return fetchJson('/api/ip-allocations/allocate', {
    method: 'POST',
    timeoutMs: 20000,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ node_id: nodeId, overwrite })
  })
}

export async function releaseNodeIp(nodeId, version = 'both') {
  return fetchJson('/api/ip-allocations/release', {
    method: 'POST',
    timeoutMs: 20000,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ node_id: nodeId, version })
  })
}

export async function getNodeBindings() {
  return fetchJson('/api/node-bindings', { timeoutMs: 15000 })
}

export async function saveNodeBinding(binding) {
  return fetchJson('/api/node-bindings', {
    method: 'POST',
    timeoutMs: 20000,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(binding)
  })
}

export async function deleteNodeBinding(nodeId) {
  return fetchJson(`/api/node-bindings/${encodeURIComponent(nodeId)}`, {
    method: 'DELETE',
    timeoutMs: 20000
  })
}

export async function getResourceStatus() {
  return fetchJson('/api/resources/status', { timeoutMs: 15000 })
}

export async function getResourceMetrics() {
  return fetchJson('/api/resources/metrics', { timeoutMs: 15000 })
}

export async function getNodeResources() {
  return fetchJson('/api/resources/nodes', { timeoutMs: 20000 })
}

export async function getNodeResource(nodeId) {
  return fetchJson(`/api/resources/nodes/${encodeURIComponent(nodeId)}`, {
    timeoutMs: 15000
  })
}

export async function getResourceHistory(
  nodeId,
  metric,
  rangeSeconds = 3600,
  stepSeconds = 60
) {
  const parsedRange = Number(rangeSeconds)
  const safeRange = Math.min(86400, Math.max(1, Number.isFinite(parsedRange) ? Math.round(parsedRange) : 3600))
  const parsedStep = Number(stepSeconds)
  const safeStep = Math.min(safeRange, Math.max(1, Number.isFinite(parsedStep) ? Math.round(parsedStep) : 60))
  const params = new URLSearchParams({
    node: nodeId,
    metric,
    range_seconds: String(safeRange),
    step_seconds: String(safeStep)
  })
  return fetchJson(`/api/resources/history?${params.toString()}`, {
    timeoutMs: 20000
  })
}
