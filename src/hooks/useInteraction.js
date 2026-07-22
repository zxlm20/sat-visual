import * as Cesium from 'cesium'
import { ref, onUnmounted } from 'vue'
import { useLoadStore } from '@/store/loadStore'

export function useInteraction(viewerRef) {
  const selectedSatId = ref(null)
  const loadStore = useLoadStore()
  let clickHandler = null
  let hoverHandler = null

  const initPick = (onSatClick, onLinkClick) => {
    if (!viewerRef.value) return

    clickHandler = new Cesium.ScreenSpaceEventHandler(viewerRef.value.canvas)

    clickHandler.setInputAction((clickEvent) => {
      const pickResult = viewerRef.value.scene.pick(clickEvent.position)
      const entity = pickResult?.id
      const topologyLink = entity?.topologyLink
      const nodeId = entity?.properties?.node_id?.getValue(
        viewerRef.value.clock.currentTime
      )

      if (Cesium.defined(pickResult) && topologyLink) {
        if (onLinkClick) onLinkClick(topologyLink)
        return
      }

      if (Cesium.defined(pickResult) && nodeId) {
        selectedSatId.value = nodeId
        if (onSatClick) onSatClick(nodeId)
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK)
  }

  const initHover = (onHover) => {
    if (!viewerRef.value) return

    hoverHandler = new Cesium.ScreenSpaceEventHandler(viewerRef.value.canvas)

    hoverHandler.setInputAction((moveEvent) => {
      const pickResult = viewerRef.value.scene.pick(moveEvent.endPosition)
      const entity = pickResult?.id

      const pickedNodeId = entity?.properties?.node_id?.getValue(
        viewerRef.value.clock.currentTime
      )

      if (Cesium.defined(pickResult) && entity?.properties && pickedNodeId) {
        const getProperty = (name) => entity.properties[name]?.getValue(
          viewerRef.value.clock.currentTime
        )
        const node = {
          node_id: getProperty('node_id'),
          physical_node: getProperty('physical_node'),
          compute_node_id: getProperty('compute_node_id'),
          type: getProperty('type'),
          orbit_layer: getProperty('orbit_layer'),
          constellation_type: getProperty('constellation_type'),
          avg_altitude_km: getProperty('avg_altitude_km'),
          sample_interval_seconds: getProperty('sample_interval_seconds'),
          sample_count: getProperty('sample_count')
        }
        const load = loadStore.getLoadByNodeId(node.node_id)

        onHover({
          node: {
            ...node,
            load
          },
          x: moveEvent.endPosition.x,
          y: moveEvent.endPosition.y
        })
        return
      }

      onHover(null)
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE)
  }

  const flyToTargetSat = (satId) => {
    if (!viewerRef.value) return
    const targetSat = viewerRef.value.entities.getById(satId)
    if (!targetSat) return
    viewerRef.value.zoomTo(
      targetSat,
      new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-30), 1500000)
    )
  }

  onUnmounted(() => {
    if (clickHandler) {
      clickHandler.destroy()
      clickHandler = null
    }

    if (hoverHandler) {
      hoverHandler.destroy()
      hoverHandler = null
    }
  })

  return {
    selectedSatId,
    initPick,
    initHover,
    flyToTargetSat
  }
}
