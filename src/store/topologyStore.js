import { computed, reactive } from 'vue'
import { getTopology2d, getTopology3d, getTopologyLinks } from '@/api/backend'

export const TOPOLOGY_TRAFFIC_META = {
  idle: { label: '空闲', color: '#4caf50', rank: 0 },
  smooth: { label: '流畅', color: '#7cb342', rank: 1 },
  normal: { label: '正常', color: '#2196f3', rank: 2 },
  light: { label: '轻度拥塞', color: '#ff9800', rank: 3 },
  medium: { label: '中度拥塞', color: '#f57c00', rank: 4 },
  heavy: { label: '重度拥塞', color: '#d32f2f', rank: 5 }
}

export const TOPOLOGY_LINK_TYPE_META = {
  physical_access: { label: '物理接入', simulated: false },
  task_stream: { label: '任务流', simulated: false },
  gsl_demo: { label: '演示星地链路', simulated: true },
  isl_intra_plane: { label: '演示星间链路', simulated: true }
}

const state = reactive({
  mode: '',
  latest_job_id: '',
  time_index: 0,
  sample_interval_seconds: 60,
  nodes: [],
  links: [],
  legend: null,
  scene: null,
  threeDNodes: [],
  threeDLinks: [],
  liveLinks: [],
  liveTimeIndex: 0,
  loading: false,
  loading3d: false,
  loadingLinks: false,
  error: '',
  threeDError: '',
  linksError: '',
  updateTime: null,
  threeDUpdateTime: null,
  linksUpdateTime: null
})

let twoDRequest = null
let threeDRequest = null
let linksRequest = null
let pendingLinksOptions = null

function canonicalLevel(value) {
  const level = String(value || 'idle').toLowerCase()
  return ({
    light_congestion: 'light',
    medium_congestion: 'medium',
    heavy_congestion: 'heavy'
  })[level] || level
}

function readBooleanFlag(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase())
  }
  return false
}

function normalizeNode(node = {}) {
  const loadLevel = canonicalLevel(node.load?.level || node.status?.load_level)
  return {
    ...node,
    id: String(node.id || node.node_id || ''),
    label: node.label || node.id || node.node_id || '',
    node_type: node.node_type || node.type || 'satellite',
    type: node.node_type || node.type || 'satellite',
    orbit_layer: String(node.orbit_layer || node.orbit || '').toUpperCase(),
    online: node.online ?? node.status?.online ?? null,
    load_level: loadLevel,
    load: node.load ? { ...node.load, level: loadLevel } : null,
    layout: node.layout || { x: node.x, y: node.y, layer_band: 0 }
  }
}

function normalizeLink(link = {}) {
  const linkType = String(link.link_type || link.type || 'unknown').toLowerCase()
  const trafficLevel = canonicalLevel(link.traffic_level || link.congestion_level)
  const trafficMeta = TOPOLOGY_TRAFFIC_META[trafficLevel] || TOPOLOGY_TRAFFIC_META.idle
  const typeMeta = TOPOLOGY_LINK_TYPE_META[linkType] || { label: linkType, simulated: false }
  const explicitlySimulated = readBooleanFlag(
    link.simulated ?? link.is_simulated ?? link.demo_link
  )
  const simulated = Boolean(typeMeta.simulated) || explicitlySimulated || linkType.endsWith('_demo')
  const simulatedColor = linkType === 'gsl_demo' ? '#62d9ff' : '#a78bfa'
  return {
    ...link,
    id: String(link.id || `${link.source}-${link.target}-${linkType}`),
    source: String(link.source || ''),
    target: String(link.target || ''),
    link_type: linkType,
    type: linkType,
    type_label: typeMeta.label,
    simulated,
    traffic: Number(link.traffic || 0),
    traffic_level: trafficLevel,
    traffic_label: link.traffic_label || trafficMeta.label,
    color_level: Number.isFinite(Number(link.color_level)) ? Number(link.color_level) : trafficMeta.rank,
    color: simulated ? simulatedColor : trafficMeta.color
  }
}

function normalizeEnvelope(data = {}) {
  return {
    ...data,
    nodes: (data.nodes || []).map(normalizeNode),
    links: (data.links || []).map(normalizeLink)
  }
}

function setTopology(data = {}) {
  const normalized = normalizeEnvelope(data)
  state.mode = normalized.mode || ''
  state.latest_job_id = normalized.latest_job_id || ''
  state.time_index = Number(normalized.time_index || 0)
  state.sample_interval_seconds = Number(normalized.sample_interval_seconds || 60)
  state.nodes = normalized.nodes
  state.links = normalized.links
  state.legend = normalized.legend || null
  state.updateTime = Date.now()
  return normalized
}

function setTopology3d(data = {}) {
  const normalized = normalizeEnvelope(data)
  state.scene = normalized.scene || null
  state.threeDNodes = normalized.nodes
  state.threeDLinks = normalized.links
  state.threeDUpdateTime = Date.now()
  if (!state.liveLinks.length) {
    state.liveLinks = normalized.links
    state.liveTimeIndex = Number(normalized.time_index || 0)
  }
  return normalized
}

async function loadTopology(options = {}) {
  state.loading = true
  state.error = ''
  try {
    return setTopology(await getTopology2d(options))
  } catch (error) {
    state.error = error?.message || '获取二维拓扑失败'
    throw error
  } finally {
    state.loading = false
  }
}

function fetchTopology(options = {}) {
  if (twoDRequest) return twoDRequest
  twoDRequest = loadTopology(options).finally(() => { twoDRequest = null })
  return twoDRequest
}

async function loadTopology3d(options = {}) {
  state.loading3d = true
  state.threeDError = ''
  try {
    return setTopology3d(await getTopology3d(options))
  } catch (error) {
    state.threeDError = error?.message || '获取三维拓扑失败'
    throw error
  } finally {
    state.loading3d = false
  }
}

function fetchTopology3d(options = {}) {
  if (threeDRequest) return threeDRequest
  threeDRequest = loadTopology3d(options).finally(() => { threeDRequest = null })
  return threeDRequest
}

async function loadTopologyLinks(options = {}) {
  state.loadingLinks = true
  if (!state.liveLinks.length) state.linksError = ''
  try {
    const data = await getTopologyLinks(options)
    const links = (data?.links || []).map(normalizeLink)
    state.liveLinks = links
    state.liveTimeIndex = Number(data?.time_index ?? options.timeIndex ?? 0)
    state.linksUpdateTime = Date.now()
    state.linksError = ''
    return links
  } catch (error) {
    state.linksError = error?.message || '刷新三维拓扑链路失败'
    throw error
  } finally {
    state.loadingLinks = false
  }
}

function fetchTopologyLinks(options = {}) {
  if (linksRequest) {
    pendingLinksOptions = options
    return linksRequest
  }
  linksRequest = loadTopologyLinks(options).finally(() => {
    linksRequest = null
    if (pendingLinksOptions) {
      const nextOptions = pendingLinksOptions
      pendingLinksOptions = null
      fetchTopologyLinks(nextOptions).catch(() => {})
    }
  })
  return linksRequest
}

export function useTopologyStore() {
  return {
    state,
    nodes: computed(() => state.nodes),
    links: computed(() => state.links),
    liveLinks: computed(() => state.liveLinks),
    loading: computed(() => state.loading),
    error: computed(() => state.error),
    setTopology,
    setTopology3d,
    fetchTopology,
    fetchTopology3d,
    fetchTopologyLinks
  }
}
