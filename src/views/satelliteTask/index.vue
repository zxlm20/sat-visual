<template>
  <div class="page-wrap">
    <div ref="sidebarWrap">
      <Sidebar @menu-change="changeMenu" />
    </div>

    <div ref="panelWrap">
      <FunctionPanel
        :current="currentMenu"
        @close="closePanel"
        @node-click="handleSatClick"
        @node-filter="applyNodeFilter"
      />
    </div>

    <CesiumEarth
      :visible-node-ids="visibleNodeIds"
      @sat-click="handleSatClick"
      @link-click="handleLinkClick"
    />

    <div ref="nodePanelWrap">
      <NodeDetailPanel
        :selected-node="selectedNode"
        :loading="nodeDetailLoading"
        :error="nodeDetailError"
        @close="closeNodePanel"
      />
    </div>

    <div class="grid-overlay"></div>
    <div class="edge-glow edge-left"></div>
    <div class="edge-glow edge-right"></div>
    <div class="bottom-console">
      <span>LIVE TELEMETRY</span>
      <strong>拖拽旋转地球，滚轮缩放，点击卫星查看节点详情</strong>
    </div>
  </div>
</template>

<script>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import CesiumEarth from './CesiumEarth.vue'
import Sidebar from '@/components/layout/Sidebar.vue'
import FunctionPanel from '@/components/layout/FunctionPanel.vue'
import NodeDetailPanel from '@/components/layout/NodeDetailPanel.vue'
import { useLoadStore } from '@/store/loadStore'
import { useNodeStore } from '@/store/nodeStore'
import { useRealtimeStore } from '@/store/realtimeStore'
import { useConstellationStore } from '@/store/constellationStore'
import { useNodeModelStore } from '@/store/nodeModelStore'
import { useResourceStore } from '@/store/resourceStore'
import { useLinkStateStore } from '@/store/linkStateStore'
import { useTopologyStore } from '@/store/topologyStore'

export default {
  name: 'SatelliteTask',
  components: {
    CesiumEarth,
    Sidebar,
    FunctionPanel,
    NodeDetailPanel
  },
  setup() {
    const currentMenu = ref(null)
    const sidebarWrap = ref(null)
    const panelWrap = ref(null)
    const nodePanelWrap = ref(null)
    const nodeDetailLoading = ref(false)
    let lastNodeOpenAt = 0
    let lastPanelOpenAt = 0
    let nodeOpenRequestId = 0
    let resourceRefreshTimer = null
    let resourcePollCount = 0
    const visibleNodeIds = ref(null)
    const {
      state: nodeState,
      fetchNodeDetail: fetchComputeNodeDetail,
      mergeLoads,
      selectNodeFromCache,
      clearSelectedNode: clearSelectedComputeNode
    } = useNodeStore()
    const {
      state: constellationState,
      getNodeById: getConstellationNodeById,
      selectNodeFromCache: selectConstellationNodeFromCache,
      fetchNodeDetail: fetchConstellationNodeDetail,
      clearSelectedNode: clearSelectedConstellationNode
    } = useConstellationStore()
    const {
      state: loadState,
      fetchLoadStatus,
      fetchLoadDetail,
      fetchLoadHistory,
      getLoadByNodeId,
      clearSelectedLoad
    } = useLoadStore()
    const { connectStatusSocket, stopRealtime } = useRealtimeStore()
    const { state: topologyState } = useTopologyStore()
    const {
      updateFilters: updateLinkFilters,
      selectLink: selectTopologyLink
    } = useLinkStateStore()
    const {
      state: nodeModelState,
      fetchManagementData,
      fetchModelDetail,
      getModelById,
      clearSelectedModel
    } = useNodeModelStore()
    const {
      state: resourceState,
      fetchResourceService,
      fetchNodeResources,
      fetchResourceDetail,
      fetchResourceHistories,
      getResourceByNode,
      clearSelectedResource
    } = useResourceStore()

    const selectedNode = computed(() => {
      const model = nodeModelState.selectedModel
      const constellation = constellationState.selectedNode
      const runtime = nodeState.selectedNode
      const standaloneResource = !model && !constellation && !runtime
        ? resourceState.selectedNode
        : null
      if (!model && !constellation && !runtime && !standaloneResource) return null
      const hasPersistedModel = Boolean(model)
      const nodeId = model?.node_id || constellation?.node_id || runtime?.node_id || standaloneResource?.node_id
      const declaredPhysicalNode = hasPersistedModel
        ? model.physical_node
        : (runtime?.physical_node || constellation?.physical_node || standaloneResource?.physical_node)
      const selectedResource = resourceState.selectedNodeId === String(nodeId || '')
        ? resourceState.selectedNode
        : null
      const selectedResourcePhysicalIds = selectedResource ? [
        selectedResource.physical_node,
        selectedResource.physical_node_id,
        selectedResource.worker_node,
        selectedResource.node
      ].filter(Boolean).map(String) : []
      const bindingConsistentSelectedResource = selectedResource && (
        !declaredPhysicalNode ||
        !selectedResourcePhysicalIds.length ||
        selectedResourcePhysicalIds.includes(String(declaredPhysicalNode))
      ) ? selectedResource : null
      const resource = hasPersistedModel && !declaredPhysicalNode
        ? null
        : (getResourceByNode(nodeId, declaredPhysicalNode) || bindingConsistentSelectedResource || standaloneResource)
      const physicalNode = declaredPhysicalNode || resource?.physical_node ||
        resource?.physical_node_id || resource?.worker_node || resource?.node ||
        (standaloneResource ? resource?.node_id : null)
      const hasPhysicalBinding = Boolean(physicalNode || resource)
      const selectedLoad = loadState.selectedNodeId === String(nodeId || '')
        ? loadState.selectedNode
        : null
      const load = hasPersistedModel && !hasPhysicalBinding
        ? null
        : (getLoadByNodeId(nodeId, physicalNode) || selectedLoad || runtime?.load || model?.load || constellation?.load)
      return {
        ...(standaloneResource || {}),
        ...(constellation || {}),
        ...(model || {}),
        ...(runtime || {}),
        node_id: nodeId,
        node_name: model?.node_name || standaloneResource?.node_name,
        node_type: model?.node_type || constellation?.node_type || runtime?.type || resource?.node_type,
        orbit_layer: model?.orbit_layer || constellation?.orbit_layer || runtime?.orbit || resource?.orbit,
        physical_node: physicalNode || null,
        physical_ipv4: hasPersistedModel
          ? (hasPhysicalBinding ? (resource?.physical_ipv4 || model.physical_ipv4 || runtime?.ipv4 || null) : null)
          : (resource?.physical_ipv4 || runtime?.ipv4 || null),
        ipv4: hasPersistedModel
          ? (hasPhysicalBinding ? (runtime?.ipv4 || model.physical_ipv4 || null) : null)
          : (resource?.physical_ipv4 || runtime?.ipv4 || constellation?.ipv4 || null),
        compute_node_id: hasPersistedModel
          ? (hasPhysicalBinding ? (runtime?.node_id || model.physical_node) : null)
          : (constellation?.compute_node_id || physicalNode || null),
        binding_role: hasPersistedModel
          ? (model.binding_role || null)
          : (constellation?.binding_role || resource?.binding_role || null),
        role: hasPersistedModel
          ? (hasPhysicalBinding ? (runtime?.role || model.binding_role || null) : null)
          : (runtime?.role || constellation?.role || null),
        online: hasPersistedModel && !hasPhysicalBinding
          ? (model.status?.online ?? false)
          : (resource?.online ?? runtime?.online ?? model?.status?.online ?? constellation?.online),
        worker_ready: hasPersistedModel && !hasPhysicalBinding
          ? null
          : (resource?.worker_ready ?? runtime?.worker_ready ?? model?.status?.worker_ready),
        task_queue_len: hasPersistedModel
          ? (hasPhysicalBinding ? (resource?.task_queue_len ?? runtime?.task_queue_len ?? null) : null)
          : (runtime?.task_queue_len ?? constellation?.task_queue_len ?? null),
        load,
        worker_pods: hasPersistedModel && !hasPhysicalBinding
          ? []
          : (runtime?.worker_pods || constellation?.worker_pods || []),
        resource_metrics: resource,
        alarm_level: resource?.alarm_level || (hasPhysicalBinding ? 'unknown' : null),
        has_node_model: hasPersistedModel
      }
    })
    const nodeDetailError = computed(() => (
      nodeModelState.error || constellationState.detailError || nodeState.detailError
    ))

    const changeMenu = (item) => {
      lastPanelOpenAt = Date.now()
      currentMenu.value = item
    }

    const handleLinkClick = (link) => {
      if (!link?.id) return
      lastPanelOpenAt = Date.now()
      updateLinkFilters({ timeIndex: topologyState.liveTimeIndex })
      selectTopologyLink(link.id)
      currentMenu.value = {
        id: 'topology',
        icon: '拓',
        name: '网络拓扑',
        desc: '动态链路与拥塞状态',
        status: 'ready',
        topologyView: 'links'
      }
    }

    const closePanel = () => {
      currentMenu.value = null
    }

    const handleSatClick = async (nodeId) => {
      const requestId = ++nodeOpenRequestId
      lastNodeOpenAt = Date.now()
      nodeDetailLoading.value = true

      try {
        const model = getModelById(nodeId)
        const constellation = getConstellationNodeById(nodeId)
        const runtime = nodeState.nodes.find((node) => (
          node.node_id === nodeId ||
          (model?.physical_node && node.physical_node === model.physical_node)
        ))
        clearSelectedComputeNode()
        clearSelectedConstellationNode()
        clearSelectedModel()
        clearSelectedResource()
        clearSelectedLoad()

        const declaredPhysicalNode = model
          ? model.physical_node
          : (runtime?.physical_node || constellation?.physical_node || '')
        const cachedResource = model && !declaredPhysicalNode
          ? null
          : getResourceByNode(nodeId, declaredPhysicalNode)
        const resourcePhysicalNode = declaredPhysicalNode || cachedResource?.physical_node ||
          cachedResource?.physical_node_id || cachedResource?.worker_node || ''

        const requests = []
        if (model) requests.push(fetchModelDetail(nodeId))
        if (constellation) {
          selectConstellationNodeFromCache(nodeId)
          requests.push(fetchConstellationNodeDetail(nodeId))
        }
        if (runtime) {
          selectNodeFromCache(runtime.node_id)
          requests.push(fetchComputeNodeDetail(runtime.node_id))
        }
        if (declaredPhysicalNode || cachedResource) {
          requests.push(fetchResourceDetail(nodeId, resourcePhysicalNode).catch(() => null))
          requests.push(fetchResourceHistories(nodeId, resourcePhysicalNode).catch(() => null))
        }
        const cachedLoad = getLoadByNodeId(nodeId, resourcePhysicalNode)
        if (declaredPhysicalNode || cachedLoad) {
          requests.push(fetchLoadDetail(nodeId, resourcePhysicalNode).catch(() => null))
          requests.push(fetchLoadHistory(nodeId, resourcePhysicalNode).catch(() => null))
        }
        await Promise.all(requests)
      } finally {
        if (requestId === nodeOpenRequestId) nodeDetailLoading.value = false
      }
    }

    const closeNodePanel = () => {
      nodeOpenRequestId += 1
      nodeDetailLoading.value = false
      clearSelectedConstellationNode()
      clearSelectedModel()
      clearSelectedResource()
      clearSelectedLoad()
      clearSelectedComputeNode()
    }

    const applyNodeFilter = ({ nodeIds }) => {
      visibleNodeIds.value = [...nodeIds]
      if (selectedNode.value && !visibleNodeIds.value.includes(selectedNode.value.node_id)) {
        closeNodePanel()
      }
    }

    const handleOutsideClick = (event) => {
      const target = event.target
      const isInSidebar = sidebarWrap.value?.contains(target)
      const isInPanel = panelWrap.value?.contains(target)
      const isInNodePanel = nodePanelWrap.value?.contains(target)
      const isInFunctionPanelOverlay = target instanceof Element && Boolean(
        target.closest('[data-function-panel-overlay]')
      )

      if (
        currentMenu.value &&
        !isInSidebar &&
        !isInPanel &&
        !isInFunctionPanelOverlay &&
        Date.now() - lastPanelOpenAt > 100
      ) {
        closePanel()
      }
      if (
        !isInNodePanel &&
        !isInFunctionPanelOverlay &&
        (selectedNode.value || nodeDetailLoading.value) &&
        Date.now() - lastNodeOpenAt > 100
      ) {
        closeNodePanel()
      }
    }

    onMounted(() => {
      document.addEventListener('click', handleOutsideClick)
      fetchLoadStatus()
        .then(() => mergeLoads(loadState.nodes))
        .catch(() => {})
      connectStatusSocket()
      fetchManagementData().catch(() => {})
      fetchResourceService().catch(() => {})
      fetchNodeResources().catch(() => {})
      resourceRefreshTimer = window.setInterval(() => {
        fetchNodeResources().catch(() => {})
        resourcePollCount += 1
        if (resourcePollCount % 4 === 0) {
          fetchResourceService().catch(() => {})
          const activeNode = selectedNode.value
          if (activeNode?.node_id && activeNode?.physical_node) {
            fetchResourceHistories(activeNode.node_id, activeNode.physical_node).catch(() => {})
            fetchLoadHistory(activeNode.node_id, activeNode.physical_node).catch(() => {})
          }
        }
      }, 15000)
    })

    onBeforeUnmount(() => {
      document.removeEventListener('click', handleOutsideClick)
      stopRealtime()
      if (resourceRefreshTimer) window.clearInterval(resourceRefreshTimer)
    })

    return {
      currentMenu,
      sidebarWrap,
      panelWrap,
      nodePanelWrap,
      selectedNode,
      nodeDetailError,
      nodeDetailLoading,
      visibleNodeIds,
      changeMenu,
      closePanel,
      handleSatClick,
      handleLinkClick,
      applyNodeFilter,
      closeNodePanel
    }
  }
}
</script>

<style scoped>
.page-wrap {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #010309;
  position: relative;
}

.grid-overlay {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 3;
  opacity: .55;
  background-image:
    linear-gradient(rgba(50, 255, 220, .045) 1px, transparent 1px),
    linear-gradient(90deg, rgba(50, 255, 220, .045) 1px, transparent 1px);
  background-size: 56px 56px;
  mask-image: radial-gradient(circle at center, transparent 0, rgba(0, 0, 0, .25) 45%, #000 100%);
}

.edge-glow {
  position: fixed;
  top: 18%;
  bottom: 18%;
  z-index: 4;
  width: 1px;
  pointer-events: none;
  background: linear-gradient(180deg, transparent, rgba(56, 255, 183, .72), transparent);
  box-shadow: 0 0 22px rgba(56, 255, 183, .28);
}

.edge-left {
  left: 112px;
}

.edge-right {
  right: 392px;
  background: linear-gradient(180deg, transparent, rgba(82, 196, 255, .72), transparent);
  box-shadow: 0 0 22px rgba(82, 196, 255, .28);
}

.bottom-console {
  position: fixed;
  left: 50%;
  bottom: 26px;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 38px;
  padding: 0 18px;
  transform: translateX(-50%);
  color: #eaffff;
  background: rgba(2, 18, 28, .58);
  border: 1px solid rgba(82, 196, 255, .24);
  border-radius: 6px;
  box-shadow: inset 0 0 18px rgba(56, 255, 183, .05), 0 10px 34px rgba(0, 0, 0, .32);
  backdrop-filter: blur(10px);
  pointer-events: none;
  font-family: 'Microsoft YaHei', 'PingFang SC', Arial, sans-serif;
}

.bottom-console span {
  color: #38ffb7;
  font-size: 11px;
  font-weight: 700;
}

.bottom-console strong {
  color: rgba(226, 255, 251, .74);
  font-size: 12px;
  font-weight: 500;
}

@media (max-width: 1180px) {
  .bottom-console,
  .edge-glow {
    display: none;
  }
}
</style>
