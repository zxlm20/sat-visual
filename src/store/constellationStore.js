import { computed, reactive } from 'vue'
import {
  getConstellationNodeDetail,
  getConstellationNodes,
  getConstellationPositions,
  getConstellationStatus,
  loadConstellationEphemeris
} from '@/api/backend'

const state = reactive({
  status: null,
  nodes: [],
  initialPositions: {},
  selectedNode: null,
  loading: false,
  error: '',
  detailError: ''
})

let initializePromise = null
let detailRequestId = 0

function normalizeNode(node = {}, oldNode = {}) {
  return {
    ...oldNode,
    ...node,
    id: node.node_id || oldNode.node_id,
    node_id: node.node_id || oldNode.node_id,
    node_type: 'satellite',
    type: 'satellite',
    orbit: node.orbit_layer || oldNode.orbit_layer || oldNode.orbit,
    // 星座接口只描述逻辑卫星。物理绑定和运行状态由节点模型、运行节点接口合并。
    physical_node: node.physical_node || null,
    ipv4: null,
    role: null,
    compute_node_id: null,
    online: node.online ?? true,
    worker_ready: null,
    worker_pods: [],
    task_queue_len: null,
    load: null
  }
}

function bindComputeNode(node) {
  return normalizeNode(node)
}

function setComputeNodes() {
  // 保留兼容调用；不再按星历顺序把前两颗卫星临时绑定到运行节点。
  if (state.nodes.length) state.nodes = state.nodes.map(bindComputeNode)
}

async function initializeConstellation() {
  if (initializePromise) return initializePromise

  initializePromise = (async () => {
    state.loading = true
    state.error = ''

    try {
      let status = await getConstellationStatus()
      if (!status?.loaded) {
        await loadConstellationEphemeris()
        status = await getConstellationStatus()
      }

      if (!status?.loaded) {
        throw new Error(status?.error || '星历加载失败')
      }

      const [nodeData, positionData] = await Promise.all([
        getConstellationNodes(),
        getConstellationPositions(0)
      ])

      state.status = status
      state.nodes = (nodeData?.nodes || []).map(bindComputeNode)
      state.initialPositions = Object.fromEntries(
        (positionData?.nodes || []).map((item) => [item.node_id, item.position])
      )
      return state.nodes
    } catch (error) {
      state.error = error?.name === 'AbortError'
        ? '星历接口请求超时'
        : (error?.message || '星历初始化失败')
      initializePromise = null
      throw error
    } finally {
      state.loading = false
    }
  })()

  return initializePromise
}

async function refreshConstellationNodes() {
  state.error = ''
  try {
    const data = await getConstellationNodes()
    state.nodes = (data?.nodes || []).map(bindComputeNode)
    return state.nodes
  } catch (error) {
    state.error = error?.message || '刷新星历卫星目录失败'
    throw error
  }
}

function getNodeById(nodeId) {
  return state.nodes.find((node) => node.node_id === nodeId)
}

function selectNodeFromCache(nodeId) {
  detailRequestId += 1
  const node = getNodeById(nodeId)
  if (!node) return null
  state.detailError = ''
  state.selectedNode = node
  return node
}

async function fetchNodeDetail(nodeId) {
  const requestId = ++detailRequestId
  state.detailError = ''
  const cached = getNodeById(nodeId)

  try {
    const data = await getConstellationNodeDetail(nodeId)
    const detail = data?.node || data
    const normalized = normalizeNode(detail, cached)
    if (requestId === detailRequestId) state.selectedNode = normalized
    return normalized
  } catch (error) {
    if (requestId === detailRequestId) {
      state.detailError = error?.message || '卫星详情请求失败，已显示缓存信息'
      state.selectedNode = cached || null
    }
    return cached || null
  }
}

function clearSelectedNode() {
  detailRequestId += 1
  state.selectedNode = null
  state.detailError = ''
}

export function useConstellationStore() {
  return {
    state,
    nodes: computed(() => state.nodes),
    selectedNode: computed(() => state.selectedNode),
    setComputeNodes,
    initializeConstellation,
    refreshConstellationNodes,
    getNodeById,
    selectNodeFromCache,
    fetchNodeDetail,
    clearSelectedNode
  }
}
