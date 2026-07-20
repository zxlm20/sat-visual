import * as Cesium from 'cesium'
import { ref } from 'vue'
import { getConstellationTrajectory } from '@/api/backend'
import { LOAD_LEVEL_META, useLoadStore } from '@/store/loadStore'
import { useNodeModelStore } from '@/store/nodeModelStore'

const ORBIT_HOVER_ALPHA = 0.78
const TRAJECTORY_CONCURRENCY = 4
const HEO_PERIOD_MINUTES = 1436
const MEO_PERIOD_MINUTES = 773
const ORBIT_LINE_STRIDE = 1
const TRAJECTORY_MAX_ATTEMPTS = 3

const orbitLines = new Map()
const nodeOrbitGroups = new Map()

function getNodeColor(node) {
  if (node.type === 'ground') return '#52c4ff'
  if (node.online === false) return '#62717d'
  if (node.load?.level && LOAD_LEVEL_META[node.load.level]) {
    return LOAD_LEVEL_META[node.load.level].color
  }
  return node.orbit_layer === 'HEO' ? '#ffb657' : '#38ffb7'
}

function getOrbitBaseAlpha(node) {
  return node.orbit_layer === 'MEO' ? 0.035 : 0.05
}

function getOrbitColor(node) {
  return node.orbit_layer === 'MEO' ? '#21966f' : getNodeColor(node)
}

function getOrbitGroupKey(node) {
  if (node.orbit_layer !== 'MEO') return node.node_id

  const declaredPlane = String(node.orbit_plane_id || '001').padStart(3, '0')
  const satelliteIndex = Number(node.satellite_index || 1)
  const derivedPlane = String(Math.ceil(satelliteIndex / 8)).padStart(3, '0')
  const planeId = declaredPlane === '001' && satelliteIndex > 8
    ? derivedPlane
    : declaredPlane
  return `MEO-${planeId}`
}

function toCartesian(position = {}) {
  return new Cesium.Cartesian3(
    Number(position.x_km || 0) * 1000,
    Number(position.y_km || 0) * 1000,
    Number(position.z_km || 0) * 1000
  )
}

function toVelocity(position = {}) {
  return new Cesium.Cartesian3(
    Number(position.vx_km_s || 0) * 1000,
    Number(position.vy_km_s || 0) * 1000,
    Number(position.vz_km_s || 0) * 1000
  )
}

export function highlightOrbit(nodeId) {
  const activeGroup = nodeOrbitGroups.get(nodeId)
  orbitLines.forEach(({ polyline, color, baseAlpha }, groupKey) => {
    const active = groupKey === activeGroup
    polyline.width = active ? 2.5 : 1
    polyline.material = Cesium.Material.fromType('Color', {
      color: Cesium.Color.fromCssColorString(color)
        .withAlpha(active ? ORBIT_HOVER_ALPHA : baseAlpha)
    })
  })
}

export function useSatellite() {
  const satEntities = ref([])
  const loadStore = useLoadStore()
  const nodeModelStore = useNodeModelStore()
  const positionProperties = new Map()
  const maxSampleIndexByNode = new Map()
  const orbitStates = new Map()
  let orbitCollection = null
  let inertialTransformCleanup = null
  let destroyed = false
  let activeVisibleNodeIds = null

  const isNodeVisible = (nodeId) => (
    !activeVisibleNodeIds || activeVisibleNodeIds.has(nodeId)
  )

  const createGroundEntity = (viewer, node) => {
    const color = new Cesium.CallbackProperty(() => {
      const load = loadStore.getLoadByNodeId(node.node_id)
      return Cesium.Color.fromCssColorString(getNodeColor({ ...node, load }))
    }, false)

    const entity = viewer.entities.add({
      id: node.node_id,
      name: node.node_id,
      show: isNodeVisible(node.node_id),
      properties: {
        node_id: node.node_id,
        physical_node: node.physical_node || '-',
        type: 'ground',
        orbit_layer: 'GROUND'
      },
      position: Cesium.Cartesian3.fromDegrees(105, 18, 40000),
      point: {
        pixelSize: 11,
        color,
        outlineColor: Cesium.Color.fromCssColorString('#061018'),
        outlineWidth: 2,
        scaleByDistance: new Cesium.NearFarScalar(1000000, 1.7, 50000000, 0.7)
      },
      label: createLabel(node.node_id)
    })
    satEntities.value.push(entity)
  }

  const createLabel = (text) => ({
    text,
    font: 'bold 16px Microsoft YaHei',
    fillColor: Cesium.Color.fromCssColorString('#eaffff'),
    outlineColor: Cesium.Color.BLACK,
    outlineWidth: 4,
    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
    pixelOffset: new Cesium.Cartesian2(0, -25),
    scaleByDistance: new Cesium.NearFarScalar(1000000, 1, 60000000, 0.68)
  })

  const createSpaceEntity = (viewer, node, initialPosition, epoch) => {
    const position = new Cesium.SampledPositionProperty(Cesium.ReferenceFrame.INERTIAL, 1)
    position.setInterpolationOptions({
      interpolationAlgorithm: Cesium.HermitePolynomialApproximation,
      interpolationDegree: 3
    })
    position.forwardExtrapolationType = Cesium.ExtrapolationType.HOLD
    position.backwardExtrapolationType = Cesium.ExtrapolationType.HOLD

    const firstPosition = initialPosition || node.first_position
    if (firstPosition) {
      position.addSample(epoch, toCartesian(firstPosition), [toVelocity(firstPosition)])
    }

    const color = new Cesium.CallbackProperty(() => {
      const model = nodeModelStore.getModelById(node.node_id)
      const physicalNode = model?.physical_node || node.physical_node || ''
      const load = loadStore.getLoadByNodeId(node.node_id, physicalNode)
      return Cesium.Color.fromCssColorString(getNodeColor({ ...node, load }))
    }, false)
    const entity = viewer.entities.add({
      id: node.node_id,
      name: node.node_id,
      show: isNodeVisible(node.node_id),
      properties: {
        node_id: node.node_id,
        physical_node: node.physical_node || '-',
        compute_node_id: node.compute_node_id || '-',
        type: 'satellite',
        orbit_layer: node.orbit_layer,
        constellation_type: node.constellation_type,
        avg_altitude_km: node.avg_altitude_km,
        sample_interval_seconds: node.sample_interval_seconds,
        sample_count: node.sample_count
      },
      position,
      orientation: new Cesium.VelocityOrientationProperty(position),
      point: {
        pixelSize: node.orbit_layer === 'HEO' ? 9 : 8,
        color,
        outlineColor: Cesium.Color.fromCssColorString('#061018'),
        outlineWidth: 2,
        scaleByDistance: new Cesium.NearFarScalar(1000000, 1.7, 65000000, 0.72),
        translucencyByDistance: new Cesium.NearFarScalar(1000000, 1, 70000000, 0.65)
      },
      label: createLabel(node.node_id)
    })

    positionProperties.set(node.node_id, position)
    maxSampleIndexByNode.set(node.node_id, 0)
    satEntities.value.push(entity)
  }

  const getOrbitPeriodMinutes = (node) => (
    node.orbit_layer === 'HEO' ? HEO_PERIOD_MINUTES : MEO_PERIOD_MINUTES
  )

  const refreshOrbitPolyline = (orbitState) => {
    orbitState.polyline.positions = [
      ...orbitState.positions,
      Cesium.Cartesian3.clone(orbitState.positions[0])
    ]
  }

  const updateOrbitCartesian = (nodeId, timeIndex, position) => {
    const groupKey = nodeOrbitGroups.get(nodeId)
    const orbitState = orbitStates.get(groupKey)
    if (!orbitState || orbitState.sourceNodeId !== nodeId) return

    const phaseMinute = timeIndex % orbitState.periodMinutes
    if (phaseMinute % ORBIT_LINE_STRIDE !== 0) return

    const slot = Math.floor(phaseMinute / ORBIT_LINE_STRIDE)
    if (slot >= orbitState.positions.length) return
    orbitState.positions[slot] = Cesium.Cartesian3.clone(position)
    refreshOrbitPolyline(orbitState)
  }

  const updateOrbitLinesAtTime = (timeIndex, epoch) => {
    const time = Cesium.JulianDate.addSeconds(
      epoch,
      timeIndex * 60,
      new Cesium.JulianDate()
    )
    positionProperties.forEach((property, nodeId) => {
      if (timeIndex > (maxSampleIndexByNode.get(nodeId) || 0)) return
      const position = property.getValueInReferenceFrame(
        time,
        Cesium.ReferenceFrame.INERTIAL
      )
      if (position) updateOrbitCartesian(nodeId, timeIndex, position)
    })
  }

  const addTrajectory = (node, points, epoch) => {
    const property = positionProperties.get(node.node_id)
    if (!property || !points.length) return

    const times = []
    const positions = []
    const derivatives = []
    points.forEach((point, index) => {
      times.push(Cesium.JulianDate.addSeconds(epoch, index * 60, new Cesium.JulianDate()))
      positions.push(toCartesian(point))
      derivatives.push([toVelocity(point)])
    })
    property.addSamples(times, positions, derivatives)
    maxSampleIndexByNode.set(node.node_id, points.length - 1)

    const periodMinutes = getOrbitPeriodMinutes(node)
    const orbitPositions = []
    for (let index = 0; index < periodMinutes; index += ORBIT_LINE_STRIDE) {
      if (points[index]) orbitPositions.push(toCartesian(points[index]))
    }
    const groupKey = getOrbitGroupKey(node)
    const existingLine = orbitLines.get(groupKey)
    nodeOrbitGroups.set(node.node_id, groupKey)
    if (existingLine) {
      existingLine.nodeIds.add(node.node_id)
      existingLine.polyline.show = [...existingLine.nodeIds].some(isNodeVisible)
      return
    }

    const color = getOrbitColor(node)
    const baseAlpha = getOrbitBaseAlpha(node)
    const nodeIds = new Set([node.node_id])
    const polyline = orbitCollection.add({
      positions: [...orbitPositions, Cesium.Cartesian3.clone(orbitPositions[0])],
      show: isNodeVisible(node.node_id),
      width: 1,
      material: Cesium.Material.fromType('Color', {
        color: Cesium.Color.fromCssColorString(color).withAlpha(baseAlpha)
      })
    })
    orbitLines.set(groupKey, { polyline, color, baseAlpha, nodeIds })
    orbitStates.set(groupKey, {
      polyline,
      sourceNodeId: node.node_id,
      positions: orbitPositions,
      initialPositions: orbitPositions.map((position) => Cesium.Cartesian3.clone(position)),
      periodMinutes
    })
  }

  const addPositionFrame = (frame, timeIndex, epoch) => {
    const time = Cesium.JulianDate.addSeconds(
      epoch,
      timeIndex * 60,
      new Cesium.JulianDate()
    )

    ;(frame?.nodes || []).forEach((item) => {
      const property = positionProperties.get(item.node_id)
      if (!property || !item.position) return
      property.addSample(time, toCartesian(item.position), [toVelocity(item.position)])
      maxSampleIndexByNode.set(
        item.node_id,
        Math.max(maxSampleIndexByNode.get(item.node_id) || 0, timeIndex)
      )
    })
  }

  const getMinimumBufferedIndex = () => {
    if (!maxSampleIndexByNode.size) return 0
    return Math.min(...maxSampleIndexByNode.values())
  }

  const applyNodeVisibility = (nodeIds) => {
    activeVisibleNodeIds = Array.isArray(nodeIds) ? new Set(nodeIds) : null
    satEntities.value.forEach((entity) => {
      entity.show = isNodeVisible(entity.id)
    })
    orbitLines.forEach(({ polyline, nodeIds: orbitNodeIds }) => {
      polyline.show = [...orbitNodeIds].some(isNodeVisible)
    })
  }

  const installInertialTransform = (viewer) => {
    const modelMatrix = new Cesium.Matrix4()
    const update = () => {
      if (!orbitCollection || viewer.isDestroyed()) return
      const rotation = Cesium.Transforms.computeIcrfToFixedMatrix(viewer.clock.currentTime)
        || Cesium.Transforms.computeTemeToPseudoFixedMatrix(viewer.clock.currentTime)
      if (rotation) {
        Cesium.Matrix4.fromRotationTranslation(rotation, Cesium.Cartesian3.ZERO, modelMatrix)
        orbitCollection.modelMatrix = modelMatrix
      }
    }
    inertialTransformCleanup = viewer.scene.preRender.addEventListener(update)
  }

  const initSatellites = (viewer, groundNodes, constellationNodes, initialPositions) => {
    destroyed = false
    viewer.entities.removeAll()
    satEntities.value = []
    positionProperties.clear()
    maxSampleIndexByNode.clear()
    orbitStates.clear()
    orbitLines.clear()
    nodeOrbitGroups.clear()
    for (let index = viewer.scene.primitives.length - 1; index >= 0; index -= 1) {
      const primitive = viewer.scene.primitives.get(index)
      if (primitive instanceof Cesium.PolylineCollection) {
        viewer.scene.primitives.remove(primitive)
      }
    }
    orbitCollection = new Cesium.PolylineCollection()
    viewer.scene.primitives.add(orbitCollection)

    if (inertialTransformCleanup) inertialTransformCleanup()
    installInertialTransform(viewer)

    const epoch = Cesium.JulianDate.now()
    groundNodes.filter((node) => node.type === 'ground').forEach((node) => {
      createGroundEntity(viewer, node)
    })
    constellationNodes.forEach((node) => {
      createSpaceEntity(viewer, node, initialPositions[node.node_id], epoch)
    })

    viewer.clock.startTime = Cesium.JulianDate.clone(epoch)
    viewer.clock.currentTime = Cesium.JulianDate.clone(epoch)
    viewer.clock.stopTime = Cesium.JulianDate.addSeconds(
      epoch,
      20160 * 60,
      new Cesium.JulianDate()
    )
    viewer.clock.clockRange = Cesium.ClockRange.CLAMPED
    viewer.clock.multiplier = 60
    viewer.clock.shouldAnimate = false
    return epoch
  }

  const loadTrajectories = async (nodes, epoch, onProgress) => {
    let cursor = 0
    let completed = 0
    const failures = []

    const worker = async () => {
      while (!destroyed) {
        const index = cursor++
        if (index >= nodes.length) return
        const node = nodes[index]
        let succeeded = false

        try {
          let data = null
          let lastError = null
          for (let attempt = 1; attempt <= TRAJECTORY_MAX_ATTEMPTS; attempt += 1) {
            try {
              data = await getConstellationTrajectory(
                node.node_id,
                1,
                getOrbitPeriodMinutes(node) + 1
              )
              if (!Array.isArray(data?.trajectory) || data.trajectory.length < 2) {
                throw new Error('轨迹采样点不足')
              }
              lastError = null
              break
            } catch (error) {
              lastError = error
              if (attempt < TRAJECTORY_MAX_ATTEMPTS) {
                await new Promise((resolve) => setTimeout(resolve, attempt * 350))
              }
            }
          }
          if (lastError) throw lastError
          if (!destroyed) {
            addTrajectory(node, data?.trajectory || [], epoch)
            succeeded = true
          }
        } catch (error) {
          failures.push({ nodeId: node.node_id, error })
          console.warn(`Satellite trajectory failed: ${node.node_id}`, error)
        } finally {
          completed += 1
          if (onProgress) {
            onProgress(completed, nodes.length, failures.length, node.node_id, succeeded)
          }
        }
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(TRAJECTORY_CONCURRENCY, nodes.length) }, worker)
    )
    return failures
  }

  const restartPlayback = (viewer) => {
    if (!viewer || viewer.isDestroyed()) return
    orbitStates.forEach((orbitState) => {
      orbitState.positions = orbitState.initialPositions.map((position) => (
        Cesium.Cartesian3.clone(position)
      ))
      refreshOrbitPolyline(orbitState)
    })
    viewer.clock.currentTime = Cesium.JulianDate.clone(viewer.clock.startTime)
    viewer.clock.shouldAnimate = true
  }

  const destroySatelliteScene = () => {
    destroyed = true
    if (inertialTransformCleanup) {
      inertialTransformCleanup()
      inertialTransformCleanup = null
    }
  }

  return {
    satEntities,
    initSatellites,
    loadTrajectories,
    addPositionFrame,
    updateOrbitLinesAtTime,
    getMinimumBufferedIndex,
    applyNodeVisibility,
    restartPlayback,
    highlightOrbit,
    destroySatelliteScene
  }
}
