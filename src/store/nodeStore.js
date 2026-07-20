import { computed, reactive } from 'vue'
import { getNodeDetail, getNodes } from '@/api/backend'

const state = reactive({
  nodes: [],
  selectedNode: null,
  loading: false,
  error: '',
  detailError: '',
  updateTime: null
})

let detailRequestId = 0

function normalizeNode(node = {}) {
  return {
    id: node.node_id,
    node_id: node.node_id,
    physical_node: node.physical_node,
    type: node.type,
    orbit: node.orbit,
    ipv4: node.ipv4,
    role: node.role,
    online: node.online === null || node.online === undefined ? null : Boolean(node.online),
    worker_ready: node.worker_ready === null || node.worker_ready === undefined
      ? null
      : Boolean(node.worker_ready),
    worker_pods: node.worker_pods || [],
    task_queue_len: node.task_queue_len ?? null,
    load: node.load || null
  }
}

function setNodes(nodes = []) {
  state.nodes = nodes.map((node) => {
    const oldNode = state.nodes.find((item) => item.node_id === node.node_id)
    return normalizeNode({
      ...oldNode,
      ...node,
      load: node.load || oldNode?.load || null
    })
  })

  if (state.selectedNode) {
    const freshSelected = state.nodes.find((node) => node.node_id === state.selectedNode.node_id)
    if (freshSelected) {
      state.selectedNode = normalizeNode({
        ...state.selectedNode,
        ...freshSelected
      })
    }
  }

  state.updateTime = Date.now()
}

function mergeNodeUpdates(nodes = []) {
  if (!nodes.length) return

  const merged = state.nodes.map((node) => {
    const update = nodes.find((item) => item.node_id === node.node_id)
    return update ? normalizeNode({ ...node, ...update }) : node
  })

  setNodes(merged)
}

function mergeLoads(loads = []) {
  if (!loads.length) return

  const merged = state.nodes.map((node) => {
    const load = loads.find((item) => item.node_id === node.node_id) ||
      loads.find((item) => (
        node.physical_node &&
        (item.physical_node === node.physical_node || item.node_id === node.physical_node)
      ))
    return load ? normalizeNode({ ...node, load }) : node
  })

  setNodes(merged)
}

function selectNodeFromCache(nodeId) {
  detailRequestId += 1
  const current = state.nodes.find((node) => node.node_id === nodeId)
  if (!current) return null

  state.detailError = ''
  state.selectedNode = normalizeNode(current)
  return state.selectedNode
}

async function fetchNodes() {
  state.loading = true
  state.error = ''

  try {
    const data = await getNodes()
    setNodes(data?.nodes || [])
    return state.nodes
  } catch (err) {
    state.error = err?.message || '获取节点列表失败'
    throw err
  } finally {
    state.loading = false
  }
}

async function fetchNodeDetail(nodeId) {
  const requestId = ++detailRequestId
  state.detailError = ''

  try {
    const data = await getNodeDetail(nodeId)
    const current = state.nodes.find((node) => node.node_id === data.node_id)
    const detail = normalizeNode({
      ...current,
      ...data,
      load: current?.load || null
    })
    if (requestId === detailRequestId) state.selectedNode = detail
    return detail
  } catch (err) {
    const cached = state.nodes.find((node) => node.node_id === nodeId) || null
    if (requestId === detailRequestId) {
      state.detailError = err?.message || '节点详情请求失败，已显示当前缓存数据'
      state.selectedNode = cached ? normalizeNode(cached) : null
    }
    return cached
  }
}

function clearSelectedNode() {
  detailRequestId += 1
  state.selectedNode = null
  state.detailError = ''
}

function getNodeById(nodeId) {
  return state.nodes.find((node) => node.node_id === nodeId)
}

export function useNodeStore() {
  return {
    state,
    nodes: computed(() => state.nodes),
    selectedNode: computed(() => state.selectedNode),
    loading: computed(() => state.loading),
    error: computed(() => state.error),
    detailError: computed(() => state.detailError),
    setNodes,
    mergeNodeUpdates,
    mergeLoads,
    selectNodeFromCache,
    clearSelectedNode,
    fetchNodes,
    fetchNodeDetail,
    getNodeById
  }
}
