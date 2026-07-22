import * as Cesium from 'cesium'
import { computed, ref } from 'vue'
import {
  isSimulatedTopologyLink,
  TOPOLOGY_LINK_TYPE_META,
  TOPOLOGY_TRAFFIC_META
} from '@/store/topologyStore'

const LINK_PREFIX = 'topology-link::'
const FLOW_PREFIX = 'topology-flow::'
const TASK_STREAM_COLOR = '#ff4fd8'
const SIMULATED_GROUND_LINK_COLOR = '#62d9ff'
const SIMULATED_INTER_SATELLITE_COLOR = '#a78bfa'

export function useTopology(viewerRef) {
  const linkEntities = new Map()
  const flowEntities = new Map()
  const activeLinks = ref([])
  let visibleNodeIds = null
  let simulatedLinksVisible = true

  const getViewer = () => {
    const viewer = viewerRef?.value
    return viewer && !viewer.isDestroyed() ? viewer : null
  }

  const getNodeEntity = (nodeId) => getViewer()?.entities.getById(nodeId)

  const isLinkVisible = (link) => {
    if (isSimulatedTopologyLink(link) && !simulatedLinksVisible) return false
    if (visibleNodeIds && (
      !visibleNodeIds.has(link.source) || !visibleNodeIds.has(link.target)
    )) return false
    const source = getNodeEntity(link.source)
    const target = getNodeEntity(link.target)
    return Boolean(source?.isShowing && target?.isShowing)
  }

  const makePositions = (link) => new Cesium.CallbackProperty((time, result = []) => {
    const source = getNodeEntity(link.source)
    const target = getNodeEntity(link.target)
    if (!source?.position || !target?.position) {
      result.length = 0
      return result
    }
    const sourcePosition = source.position.getValue(time, result[0] || new Cesium.Cartesian3())
    const targetPosition = target.position.getValue(time, result[1] || new Cesium.Cartesian3())
    if (!sourcePosition || !targetPosition) {
      result.length = 0
      return result
    }
    result[0] = sourcePosition
    result[1] = targetPosition
    result.length = 2
    return result
  }, false)

  const makeMaterial = (link) => {
    const color = Cesium.Color.fromCssColorString(
      link.color || TOPOLOGY_TRAFFIC_META[link.traffic_level]?.color || '#2196f3'
    )
    if (link.link_type === 'task_stream') {
      return new Cesium.PolylineGlowMaterialProperty({
        color: Cesium.Color.fromCssColorString(TASK_STREAM_COLOR).withAlpha(0.96),
        glowPower: 0.28,
        taperPower: 0.55
      })
    }
    if (isSimulatedTopologyLink(link)) {
      const simulatedColor = Cesium.Color.fromCssColorString(
        ['gsl', 'gsl_demo'].includes(link.link_type)
          ? SIMULATED_GROUND_LINK_COLOR
          : SIMULATED_INTER_SATELLITE_COLOR
      )
      return new Cesium.PolylineDashMaterialProperty({
        color: simulatedColor.withAlpha(0.78),
        gapColor: Cesium.Color.TRANSPARENT,
        dashLength: ['gsl', 'gsl_demo'].includes(link.link_type) ? 26 : 20,
        dashPattern: 0xFF00
      })
    }
    return new Cesium.ColorMaterialProperty(color.withAlpha(
      link.link_type === 'task_stream' ? 0.82 : 0.58
    ))
  }

  const linkWidth = (link) => {
    if (link.link_type === 'task_stream') return 3.2
    if (isSimulatedTopologyLink(link)) return 1.25
    const level = Number(link.color_level || 0)
    return Math.min(2, (link.link_type === 'task_stream' ? 1.2 : 1) + level * 0.14)
  }

  const makeFlowPosition = (link) => new Cesium.CallbackPositionProperty((time, result) => {
    const source = getNodeEntity(link.source)
    const target = getNodeEntity(link.target)
    const sourcePosition = source?.position?.getValue(time, new Cesium.Cartesian3())
    const targetPosition = target?.position?.getValue(time, new Cesium.Cartesian3())
    if (!sourcePosition || !targetPosition) return undefined
    const cycleMilliseconds = 10000
    const fraction = (Date.now() % cycleMilliseconds) / cycleMilliseconds
    return Cesium.Cartesian3.lerp(
      sourcePosition,
      targetPosition,
      fraction,
      result || new Cesium.Cartesian3()
    )
  }, false, Cesium.ReferenceFrame.FIXED)

  const createFlowEntity = (link) => {
    const viewer = getViewer()
    if (!viewer || link.link_type !== 'task_stream') return null
    const entity = viewer.entities.add({
      id: `${FLOW_PREFIX}${link.id}`,
      name: `任务流方向: ${link.source} → ${link.target}`,
      position: makeFlowPosition(link),
      point: {
        show: new Cesium.CallbackProperty(() => isLinkVisible(link), false),
        pixelSize: 8,
        color: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.fromCssColorString(TASK_STREAM_COLOR),
        outlineWidth: 3,
        scaleByDistance: new Cesium.NearFarScalar(1000000, 1.5, 70000000, 0.75)
      },
      label: {
        show: new Cesium.CallbackProperty(() => isLinkVisible(link), false),
        text: '任务',
        font: 'bold 12px Microsoft YaHei',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.fromCssColorString('#4b092f'),
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -18),
        scaleByDistance: new Cesium.NearFarScalar(1000000, 1.2, 70000000, 0.72)
      }
    })
    entity.topologyLink = link
    return entity
  }

  const createLinkEntity = (link) => {
    const viewer = getViewer()
    if (!viewer || !getNodeEntity(link.source) || !getNodeEntity(link.target)) return null
    const entity = viewer.entities.add({
      id: `${LINK_PREFIX}${link.id}`,
      name: `${link.type_label || link.link_type}: ${link.source} → ${link.target}`,
      polyline: {
        positions: makePositions(link),
        show: new Cesium.CallbackProperty(() => isLinkVisible(link), false),
        width: linkWidth(link),
        material: makeMaterial(link),
        arcType: Cesium.ArcType.NONE
      }
    })
    entity.topologyLink = link
    return entity
  }

  const updateLinkEntity = (entity, link) => {
    entity.name = `${link.type_label || link.link_type}: ${link.source} → ${link.target}`
    entity.topologyLink = link
    entity.polyline.width = linkWidth(link)
    entity.polyline.material = makeMaterial(link)
    const flow = flowEntities.get(link.id)
    if (flow) {
      flow.name = `任务流方向: ${link.source} → ${link.target}`
      flow.label.text = '任务'
    }
  }

  const syncTopologyLinks = (links = []) => {
    const viewer = getViewer()
    if (!viewer) return
    const nextIds = new Set(links.map((link) => link.id))
    linkEntities.forEach((entity, id) => {
      if (nextIds.has(id)) return
      viewer.entities.remove(entity)
      linkEntities.delete(id)
      const flow = flowEntities.get(id)
      if (flow) viewer.entities.remove(flow)
      flowEntities.delete(id)
    })
    links.forEach((link) => {
      const existing = linkEntities.get(link.id)
      if (existing) updateLinkEntity(existing, link)
      else {
        const entity = createLinkEntity(link)
        if (entity) {
          linkEntities.set(link.id, entity)
          const flow = createFlowEntity(link)
          if (flow) flowEntities.set(link.id, flow)
        }
      }
    })
    activeLinks.value = links
  }

  const applyTopologyVisibility = (nodeIds) => {
    visibleNodeIds = Array.isArray(nodeIds) ? new Set(nodeIds) : null
  }

  const setSimulatedLinksVisible = (visible) => {
    simulatedLinksVisible = Boolean(visible)
    const viewer = getViewer()
    if (viewer) viewer.scene.requestRender()
  }

  const clearTopologyLinks = () => {
    const viewer = getViewer()
    if (viewer) linkEntities.forEach((entity) => viewer.entities.remove(entity))
    if (viewer) flowEntities.forEach((entity) => viewer.entities.remove(entity))
    linkEntities.clear()
    flowEntities.clear()
    activeLinks.value = []
  }

  const destroyTopology = () => {
    clearTopologyLinks()
    visibleNodeIds = null
  }

  const linkCounts = computed(() => {
    const counts = {
      total: activeLinks.value.length,
      real: 0,
      simulated: 0,
      task: 0,
      physical: 0
    }
    activeLinks.value.forEach((link) => {
      if (isSimulatedTopologyLink(link)) counts.simulated += 1
      else counts.real += 1
      if (link.link_type === 'task_stream') counts.task += 1
      if (link.link_type === 'physical_access') counts.physical += 1
    })
    return counts
  })

  return {
    activeLinks,
    linkCounts,
    linkTypes: TOPOLOGY_LINK_TYPE_META,
    trafficLevels: TOPOLOGY_TRAFFIC_META,
    syncTopologyLinks,
    applyTopologyVisibility,
    setSimulatedLinksVisible,
    clearTopologyLinks,
    destroyTopology
  }
}
