import { computed, reactive } from 'vue'
import {
  allocateNodeIp,
  checkIpAllocation,
  deleteNodeBinding,
  getIpPools,
  getNodeBindings,
  getNodeModel,
  getNodeModels,
  releaseNodeIp,
  saveNodeBinding,
  syncNodeModels,
  updateIpPool,
  updateNodeModel
} from '@/api/backend'

const state = reactive({
  models: [],
  pools: {},
  bindings: [],
  selectedModel: null,
  ipCheck: null,
  loading: false,
  saving: false,
  error: '',
  actionMessage: ''
})

let detailRequestId = 0

function extractNode(data) {
  return data?.node || data?.model || data
}

function extractBindings(data) {
  return (data?.bindings || []).filter((binding) => binding?.node_id && binding?.physical_node)
}

function replaceModel(model, updateSelection = true) {
  if (!model?.node_id) return
  const index = state.models.findIndex((item) => item.node_id === model.node_id)
  if (index >= 0) state.models[index] = { ...state.models[index], ...model }
  else state.models.push(model)
  if (updateSelection && state.selectedModel?.node_id === model.node_id) {
    state.selectedModel = { ...state.selectedModel, ...model }
  }
}

async function fetchNodeModels(filters = {}) {
  const data = await getNodeModels(filters)
  state.models = data?.nodes || []
  return state.models
}

async function fetchManagementData() {
  if (state.loading) return
  state.loading = true
  state.error = ''
  try {
    const [models, pools, bindings] = await Promise.all([
      getNodeModels(),
      getIpPools(),
      getNodeBindings()
    ])
    state.models = models?.nodes || []
    state.pools = pools?.pools || {}
    state.bindings = extractBindings(bindings)
  } catch (error) {
    state.error = error?.message || '读取节点管理数据失败'
    throw error
  } finally {
    state.loading = false
  }
}

async function synchronizeModels({ overwrite = false, bindDemoWorkers = true } = {}) {
  state.saving = true
  state.error = ''
  state.actionMessage = ''
  try {
    const result = await syncNodeModels(overwrite, bindDemoWorkers)
    await fetchManagementData()
    state.actionMessage = `节点模型同步完成，共 ${state.models.length} 个节点`
    return result
  } catch (error) {
    state.error = error?.message || '同步节点模型失败'
    throw error
  } finally {
    state.saving = false
  }
}

async function fetchModelDetail(nodeId) {
  const requestId = ++detailRequestId
  state.error = ''
  try {
    const model = extractNode(await getNodeModel(nodeId))
    replaceModel(model, requestId === detailRequestId)
    if (requestId === detailRequestId) state.selectedModel = model
    return model
  } catch (error) {
    const cached = state.models.find((item) => item.node_id === nodeId) || null
    if (requestId === detailRequestId) {
      state.selectedModel = cached
      state.error = error?.message || '读取节点模型失败'
    }
    return cached
  }
}

async function saveModel(nodeId, patch) {
  state.saving = true
  state.error = ''
  state.actionMessage = ''
  try {
    const model = extractNode(await updateNodeModel(nodeId, patch))
    if (model?.node_id) replaceModel(model)
    else await fetchModelDetail(nodeId)
    state.actionMessage = '节点档案已保存'
    return state.selectedModel
  } catch (error) {
    state.error = error?.message || '保存节点档案失败'
    throw error
  } finally {
    state.saving = false
  }
}

async function checkIp(payload) {
  state.error = ''
  try {
    state.ipCheck = await checkIpAllocation(payload)
    return state.ipCheck
  } catch (error) {
    state.ipCheck = null
    state.error = error?.message || '检查 IP 地址失败'
    throw error
  }
}

async function allocateIp(nodeId, overwrite = true) {
  state.saving = true
  state.error = ''
  state.actionMessage = ''
  try {
    const result = await allocateNodeIp(nodeId, overwrite)
    await fetchModelDetail(nodeId)
    state.actionMessage = '逻辑 IP 已自动分配'
    return result
  } catch (error) {
    state.error = error?.message || '自动分配 IP 失败'
    throw error
  } finally {
    state.saving = false
  }
}

async function releaseIp(nodeId, version = 'both') {
  state.saving = true
  state.error = ''
  state.actionMessage = ''
  try {
    const result = await releaseNodeIp(nodeId, version)
    await fetchModelDetail(nodeId)
    state.actionMessage = '逻辑 IP 已释放'
    return result
  } catch (error) {
    state.error = error?.message || '释放 IP 失败'
    throw error
  } finally {
    state.saving = false
  }
}

async function savePool(layer, ipv4Cidr, ipv6Cidr) {
  state.saving = true
  state.error = ''
  state.actionMessage = ''
  try {
    const result = await updateIpPool(layer, ipv4Cidr, ipv6Cidr)
    const pools = await getIpPools()
    state.pools = pools?.pools || {}
    state.actionMessage = `${layer} 地址池已保存`
    return result
  } catch (error) {
    state.error = error?.message || '保存 IP 地址池失败'
    throw error
  } finally {
    state.saving = false
  }
}

async function saveBinding(binding) {
  state.saving = true
  state.error = ''
  state.actionMessage = ''
  try {
    const result = await saveNodeBinding(binding)
    const bindings = await getNodeBindings()
    state.bindings = extractBindings(bindings)
    await fetchModelDetail(binding.node_id)
    state.actionMessage = '物理节点绑定已保存'
    return result
  } catch (error) {
    state.error = error?.message || '保存物理节点绑定失败'
    throw error
  } finally {
    state.saving = false
  }
}

async function removeBinding(nodeId) {
  state.saving = true
  state.error = ''
  state.actionMessage = ''
  try {
    const result = await deleteNodeBinding(nodeId)
    state.bindings = state.bindings.filter((item) => item.node_id !== nodeId)
    await fetchModelDetail(nodeId)
    state.actionMessage = '物理节点绑定已解除'
    return result
  } catch (error) {
    state.error = error?.message || '解除物理节点绑定失败'
    throw error
  } finally {
    state.saving = false
  }
}

function getModelById(nodeId) {
  return state.models.find((item) => item.node_id === nodeId) || null
}

function clearSelectedModel() {
  detailRequestId += 1
  state.selectedModel = null
  state.ipCheck = null
  state.actionMessage = ''
}

export function useNodeModelStore() {
  return {
    state,
    models: computed(() => state.models),
    fetchNodeModels,
    fetchManagementData,
    synchronizeModels,
    fetchModelDetail,
    saveModel,
    checkIp,
    allocateIp,
    releaseIp,
    savePool,
    saveBinding,
    removeBinding,
    getModelById,
    clearSelectedModel
  }
}
