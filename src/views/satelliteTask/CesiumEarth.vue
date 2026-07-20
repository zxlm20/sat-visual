<template>
  <div class="cesium-container">
    <div id="cesiumContainer" ref="cesiumContainer"></div>

    <div v-if="loading" class="loading-tip">
      <div class="loader-ring">
        <div class="ring"></div>
        <div class="ring"></div>
        <div class="ring"></div>
        <div class="loader-text">Initializing orbital scene...</div>
      </div>
    </div>

    <div class="hud-title">
      <span>ORBITAL TRACKING</span>
      <strong>星网态势监控</strong>
    </div>

    <div class="top-toolbar">
      <div class="time-navigation" :class="{ reviewing: reviewMode }">
        <div class="time-copy">
          <span>{{ reviewMode ? '历史回看' : '当前星历时间' }}</span>
          <strong>{{ displayedTimeText }}</strong>
          <small v-if="reviewMode">距当前 {{ reviewOffsetText }}</small>
        </div>
        <input
          :value="displayTimeIndex"
          type="range"
          min="0"
          :max="liveTimeIndex"
          step="1"
          aria-label="星历时间回看"
          @input="reviewAtTime"
        />
        <button v-if="reviewMode" type="button" @click="returnToLive">回到现在</button>
        <span v-else class="live-mark">实时</span>
      </div>

      <div class="top-status-bar">
        <div>
          <span>空间卫星</span>
          <strong>{{ satelliteCount }}</strong>
        </div>
        <div>
          <span>星历轨迹</span>
          <strong>{{ ephemerisProgressText }}</strong>
        </div>
        <div>
          <span>播放状态</span>
          <strong>{{ playbackText }}</strong>
        </div>
      </div>
    </div>

    <div v-if="ephemerisError" class="ephemeris-error">
      {{ ephemerisError }}
    </div>

    <div class="topology-hud" :class="{ disabled: !topologyEnabled }">
      <label class="topology-toggle">
        <input v-model="topologyEnabled" type="checkbox" />
        <span>三维网络链路</span>
        <strong>{{ topologyLinkCounts.total }}</strong>
      </label>
      <label v-if="topologyEnabled" class="simulated-toggle">
        <input v-model="includeSimulatedLinks" type="checkbox" />
        显示演示链路
      </label>
      <div v-if="topologyEnabled" class="topology-counts">
        <span>真实关系 {{ topologyLinkCounts.real }}</span>
        <span>演示关系 {{ topologyLinkCounts.simulated }}</span>
        <span>任务流 {{ topologyLinkCounts.task }}</span>
      </div>
      <div v-if="topologyEnabled && topologyTaskLinks.length" class="task-flow-list">
        <strong>当前任务流向</strong>
        <span v-for="link in topologyTaskLinks" :key="link.id">
          {{ link.source }} <b>→</b> {{ link.target }}
          <em>历史分发量 {{ link.traffic }}</em>
        </span>
      </div>
      <div v-if="topologyEnabled" class="traffic-legend">
        <span v-for="(meta, key) in trafficLevels" :key="key">
          <i :style="{ background: meta.color }"></i>{{ meta.label }}
        </span>
      </div>
      <small v-if="topologyEnabled">粉色发光线和移动光点表示任务流方向；虚线为演示关系</small>
      <em v-if="topologyDisplayError">{{ topologyDisplayError }}</em>
    </div>

    <div class="corner-decoration corner-tl"></div>
    <div class="corner-decoration corner-tr"></div>
    <div class="corner-decoration corner-bl"></div>
    <div class="corner-decoration corner-br"></div>

    <div class="scanlines-overlay"></div>
    <div class="solar-flare"></div>

    <div
      v-if="hoverInfo"
      class="node-tooltip"
      :style="tooltipStyle"
    >
      <div class="tip-title">{{ hoverInfo.node.node_id }}</div>
      <div class="tip-row">
        <span>轨道层</span>
        <strong>{{ hoverInfo.node.orbit_layer || '-' }}</strong>
      </div>
      <div class="tip-row">
        <span>平均高度</span>
        <strong>{{ formatAltitude(hoverInfo.node.avg_altitude_km) }}</strong>
      </div>
      <div class="tip-row">
        <span>绑定节点</span>
        <strong>{{ hoverInfo.node.compute_node_id || hoverInfo.node.physical_node || '-' }}</strong>
      </div>
      <div class="tip-row">
        <span>采样间隔</span>
        <strong>{{ hoverInfo.node.sample_interval_seconds || '-' }} s</strong>
      </div>
    </div>

    <button class="reset-btn" @click="resetCamera">
      复位视角
    </button>
    <button
      v-if="playbackCompleted"
      class="restart-btn"
      @click="restartEphemeris"
    >
      重新播放
    </button>
  </div>
</template>

<script>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { JulianDate } from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { getConstellationPositions } from '@/api/backend'
import { useCesium } from '@/hooks/useCesium'
import { useSatellite } from '@/hooks/useSatellite'
import { useInteraction } from '@/hooks/useInteraction'
import { useTopology } from '@/hooks/useTopology'
import { useNodeStore } from '@/store/nodeStore'
import { useNodeModelStore } from '@/store/nodeModelStore'
import { useConstellationStore } from '@/store/constellationStore'
import { useTopologyStore } from '@/store/topologyStore'

const MAX_TIME_INDEX = 20160
const BUFFER_AHEAD_MINUTES = 60

export default {
  name: 'CesiumEarth',
  props: {
    visibleNodeIds: {
      type: Array,
      default: null
    }
  },
  emits: ['sat-click'],
  setup(props, { emit }) {
    const cesiumContainer = ref(null)
    const hoverInfo = ref(null)
    const trajectoryLoaded = ref(0)
    const trajectoryTotal = ref(30)
    const trajectoryFailures = ref(0)
    const ephemerisError = ref('')
    const sceneReady = ref(false)
    const playbackCompleted = ref(false)
    const buffering = ref(false)
    const reviewMode = ref(false)
    const topologyEnabled = ref(true)
    const includeSimulatedLinks = ref(true)
    const liveTimeSeconds = ref(0)
    const displayTimeIndex = ref(0)
    const displayTimeSeconds = ref(0)
    const trajectoryResults = ref({})

    const {
      viewer,
      loading,
      resetCamera
    } = useCesium(cesiumContainer)

    const {
      initSatellites,
      loadTrajectories,
      addPositionFrame,
      updateOrbitLinesAtTime,
      getMinimumBufferedIndex,
      applyNodeVisibility,
      restartPlayback,
      highlightOrbit,
      destroySatelliteScene
    } = useSatellite()
    const {
      activeLinks: topologyActiveLinks,
      linkCounts: topologyLinkCounts,
      trafficLevels,
      syncTopologyLinks,
      applyTopologyVisibility,
      clearTopologyLinks,
      destroyTopology
    } = useTopology(viewer)
    const { initPick, initHover, flyToTargetSat } = useInteraction(viewer)
    const { state } = useNodeStore()
    const { state: nodeModelState } = useNodeModelStore()
    const {
      state: constellationState,
      setComputeNodes,
      initializeConstellation
    } = useConstellationStore()
    const {
      state: topologyState,
      fetchTopology3d,
      fetchTopologyLinks
    } = useTopologyStore()

    let ephemerisEpoch = null
    let nextFrameIndex = 0
    let desiredBufferIndex = 0
    let bufferPromise = null
    let playbackTickCleanup = null
    let disposed = false
    let lastBufferFailureAt = 0
    let lastOrbitUpdateIndex = -1
    let lastRealtimeTick = 0

    watch(
      () => props.visibleNodeIds,
      (nodeIds) => {
        applyNodeVisibility(nodeIds)
        applyTopologyVisibility(nodeIds)
        if (hoverInfo.value && Array.isArray(nodeIds)) {
          const hoveredId = hoverInfo.value.node?.node_id
          if (!nodeIds.includes(hoveredId)) {
            hoverInfo.value = null
            highlightOrbit(null)
          }
        }
      },
      { immediate: true }
    )

    watch(
      () => topologyState.liveLinks,
      (links) => {
        if (topologyEnabled.value) syncTopologyLinks(filterVisibleTopologyLinks(links))
      },
      { deep: true }
    )

    watch(topologyEnabled, (enabled) => {
      if (enabled) {
        syncTopologyLinks(topologyState.liveLinks)
        refreshTopologyLinks(displayTimeIndex.value)
      } else {
        clearTopologyLinks()
      }
    })

    watch(includeSimulatedLinks, () => {
      if (!topologyEnabled.value) return
      syncTopologyLinks(filterVisibleTopologyLinks(topologyState.liveLinks))
      refreshTopologyLinks(displayTimeIndex.value)
    })

    const getCurrentTimeIndex = () => {
      if (!viewer.value || !ephemerisEpoch) return 0
      const elapsedSeconds = JulianDate.secondsDifference(
        viewer.value.clock.currentTime,
        ephemerisEpoch
      )
      return Math.max(0, Math.floor(elapsedSeconds / 60))
    }

    const getCurrentTimeSeconds = () => {
      if (!viewer.value || !ephemerisEpoch) return 0
      return Math.max(0, JulianDate.secondsDifference(
        viewer.value.clock.currentTime,
        ephemerisEpoch
      ))
    }

    const requestBufferThrough = (targetIndex) => {
      desiredBufferIndex = Math.min(
        MAX_TIME_INDEX,
        Math.max(desiredBufferIndex, targetIndex)
      )
      if (bufferPromise || disposed || nextFrameIndex > desiredBufferIndex) return
      if (Date.now() - lastBufferFailureAt < 3000) return

      bufferPromise = (async () => {
        while (!disposed && nextFrameIndex <= desiredBufferIndex) {
          const requestedIndex = nextFrameIndex
          const frame = await getConstellationPositions(requestedIndex)
          if (disposed) return
          const actualIndex = frame?.nodes?.[0]?.time_index
          if (actualIndex !== requestedIndex) {
            throw new Error(`星历返回时间异常：请求 ${requestedIndex}，实际 ${actualIndex}`)
          }
          addPositionFrame(frame, requestedIndex, ephemerisEpoch)
          nextFrameIndex += 1
        }
        ephemerisError.value = trajectoryFailures.value
          ? `${trajectoryFailures.value} 颗卫星首圈轨迹加载失败`
          : ''
      })()
        .catch((error) => {
          lastBufferFailureAt = Date.now()
          ephemerisError.value = error?.message || '后续星历缓存失败，正在重试'
        })
        .finally(() => {
          bufferPromise = null
          if (!viewer.value || viewer.value.isDestroyed() || playbackCompleted.value) return
          const streamIndex = Math.floor(liveTimeSeconds.value / 60)
          if (buffering.value && getMinimumBufferedIndex() - streamIndex > 5) {
            buffering.value = false
            if (!reviewMode.value) viewer.value.clock.shouldAnimate = true
          }
          if (nextFrameIndex <= desiredBufferIndex) requestBufferThrough(desiredBufferIndex)
        })
    }

    const installPlaybackStreaming = () => {
      nextFrameIndex = getMinimumBufferedIndex()
      desiredBufferIndex = nextFrameIndex
      lastRealtimeTick = Date.now()
      playbackTickCleanup = viewer.value.clock.onTick.addEventListener(() => {
        if (disposed || !viewer.value) return
        const now = Date.now()
        if (reviewMode.value) {
          const elapsedRealSeconds = Math.max(0, (now - lastRealtimeTick) / 1000)
          liveTimeSeconds.value = Math.min(
            MAX_TIME_INDEX * 60,
            liveTimeSeconds.value + elapsedRealSeconds * viewer.value.clock.multiplier
          )
        } else {
          liveTimeSeconds.value = getCurrentTimeSeconds()
        }
        lastRealtimeTick = now

        const currentIndex = getCurrentTimeIndex()
        const streamIndex = Math.floor(liveTimeSeconds.value / 60)
        displayTimeIndex.value = currentIndex
        displayTimeSeconds.value = getCurrentTimeSeconds()

        if (!reviewMode.value && currentIndex !== lastOrbitUpdateIndex) {
          updateOrbitLinesAtTime(currentIndex, ephemerisEpoch)
          lastOrbitUpdateIndex = currentIndex
          if (topologyEnabled.value) refreshTopologyLinks(currentIndex)
        }

        if (streamIndex >= MAX_TIME_INDEX) {
          playbackCompleted.value = true
          buffering.value = false
          if (!reviewMode.value) viewer.value.clock.shouldAnimate = false
          return
        }

        const bufferedIndex = getMinimumBufferedIndex()
        if (bufferedIndex - streamIndex <= 1 && nextFrameIndex <= MAX_TIME_INDEX) {
          buffering.value = true
          if (!reviewMode.value) viewer.value.clock.shouldAnimate = false
        }
        if (bufferedIndex - streamIndex <= BUFFER_AHEAD_MINUTES) {
          requestBufferThrough(streamIndex + BUFFER_AHEAD_MINUTES)
        }
      })
    }

    const renderSatellites = async () => {
      if (!viewer.value || sceneReady.value) return
      sceneReady.value = true
      ephemerisError.value = ''

      try {
        setComputeNodes(state.nodes)
        await initializeConstellation()
        ephemerisEpoch = initSatellites(
          viewer.value,
          state.nodes,
          constellationState.nodes,
          constellationState.initialPositions
        )
        trajectoryTotal.value = constellationState.nodes.length

        fetchTopology3d({
          timeIndex: 0,
          includeSimulatedLinks: includeSimulatedLinks.value,
          includeTrajectories: false
        }).then((data) => {
          if (!disposed && topologyEnabled.value) {
            syncTopologyLinks(filterVisibleTopologyLinks(data?.links || []))
          }
        }).catch(() => {})

        const failures = await loadTrajectories(
          constellationState.nodes,
          ephemerisEpoch,
          (completed, total, failed, nodeId, succeeded) => {
            trajectoryLoaded.value = completed
            trajectoryTotal.value = total
            trajectoryFailures.value = failed
            trajectoryResults.value = {
              ...trajectoryResults.value,
              [nodeId]: succeeded
            }
          }
        )

        if (failures.length === constellationState.nodes.length) {
          throw new Error('所有卫星轨迹均加载失败')
        }
        if (viewer.value && !viewer.value.isDestroyed()) {
          installPlaybackStreaming()
          viewer.value.clock.shouldAnimate = true
        }
        if (failures.length) {
          const failedIds = failures.map((item) => item.nodeId).join('、')
          const firstReason = failures[0]?.error?.message
          ephemerisError.value = `${failedIds} 首圈轨迹加载失败${firstReason ? `：${firstReason}` : ''}`
        }
      } catch (error) {
        sceneReady.value = false
        ephemerisError.value = constellationState.error || error?.message || '星历场景初始化失败'
      }
    }

    let initTimer = null

    onMounted(() => {
      initTimer = setInterval(() => {
        if (!viewer.value) return

        clearInterval(initTimer)
        initTimer = null
        renderSatellites()

        initPick((satId) => {
          emit('sat-click', satId)
        })

        initHover((payload) => {
          const model = nodeModelState.models.find((item) => (
            item.node_id === payload?.node?.node_id
          ))
          if (payload?.node && model) {
            payload.node.physical_node = model.physical_node || null
            payload.node.compute_node_id = model.physical_node || null
          }
          hoverInfo.value = payload
          highlightOrbit(payload?.node?.node_id || null)
        })
      }, 100)
    })

    onBeforeUnmount(() => {
      disposed = true
      if (initTimer) clearInterval(initTimer)
      if (playbackTickCleanup) playbackTickCleanup()
      destroySatelliteScene()
      destroyTopology()
    })

    const flyToSat = (satId) => {
      flyToTargetSat(satId)
    }

    const visibleConstellationNodes = computed(() => {
      if (!Array.isArray(props.visibleNodeIds)) return constellationState.nodes
      const visibleIds = new Set(props.visibleNodeIds)
      return constellationState.nodes.filter((node) => visibleIds.has(node.node_id))
    })
    const satelliteCount = computed(() => visibleConstellationNodes.value.length)
    const ephemerisProgressText = computed(() => {
      if (!trajectoryTotal.value) return '准备中'
      const visibleNodes = visibleConstellationNodes.value
      const completed = visibleNodes.filter((node) => (
        Object.prototype.hasOwnProperty.call(trajectoryResults.value, node.node_id)
      )).length
      return `${completed}/${visibleNodes.length}`
    })

    const playbackText = computed(() => {
      if (trajectoryLoaded.value < trajectoryTotal.value) return '缓存轨迹'
      if (reviewMode.value) return '历史回看'
      if (playbackCompleted.value) return '播放完成'
      if (buffering.value) return '等待星历'
      return trajectoryFailures.value ? '部分运行' : '平滑插值'
    })

    const restartEphemeris = () => {
      if (!viewer.value) return
      playbackCompleted.value = false
      buffering.value = false
      reviewMode.value = false
      liveTimeSeconds.value = 0
      displayTimeIndex.value = 0
      displayTimeSeconds.value = 0
      lastRealtimeTick = Date.now()
      lastOrbitUpdateIndex = -1
      restartPlayback(viewer.value)
      if (topologyEnabled.value) refreshTopologyLinks(0)
    }

    const liveTimeIndex = computed(() => Math.floor(liveTimeSeconds.value / 60))
    const formatEphemerisTime = (seconds) => {
      const totalSeconds = Math.max(0, Math.floor(seconds))
      const days = Math.floor(totalSeconds / 86400)
      const hours = Math.floor((totalSeconds % 86400) / 3600)
      const minutes = Math.floor((totalSeconds % 3600) / 60)
      const secs = totalSeconds % 60
      const clock = [hours, minutes, secs].map((value) => String(value).padStart(2, '0')).join(':')
      return days ? `第 ${days + 1} 天 ${clock}` : `第 1 天 ${clock}`
    }
    const formatOffset = (seconds) => {
      const totalMinutes = Math.max(0, Math.floor(seconds / 60))
      const days = Math.floor(totalMinutes / 1440)
      const hours = Math.floor((totalMinutes % 1440) / 60)
      const minutes = totalMinutes % 60
      return [
        days ? `${days}天` : '',
        hours ? `${hours}小时` : '',
        `${minutes}分钟`
      ].filter(Boolean).join(' ')
    }
    const displayedTimeText = computed(() => formatEphemerisTime(displayTimeSeconds.value))
    const reviewOffsetText = computed(() => (
      formatOffset(liveTimeSeconds.value - displayTimeSeconds.value)
    ))
    const reviewAtTime = (event) => {
      if (!viewer.value || !ephemerisEpoch) return
      const targetIndex = Math.max(0, Math.min(liveTimeIndex.value, Number(event.target.value)))
      if (targetIndex >= liveTimeIndex.value) {
        returnToLive()
        return
      }
      if (!reviewMode.value) liveTimeSeconds.value = getCurrentTimeSeconds()
      reviewMode.value = true
      displayTimeIndex.value = targetIndex
      displayTimeSeconds.value = targetIndex * 60
      viewer.value.clock.currentTime = JulianDate.addSeconds(
        ephemerisEpoch,
        targetIndex * 60,
        new JulianDate()
      )
      viewer.value.clock.shouldAnimate = false
      lastRealtimeTick = Date.now()
      if (topologyEnabled.value) refreshTopologyLinks(targetIndex)
    }
    function returnToLive() {
      if (!viewer.value || !ephemerisEpoch) return
      reviewMode.value = false
      viewer.value.clock.currentTime = JulianDate.addSeconds(
        ephemerisEpoch,
        liveTimeSeconds.value,
        new JulianDate()
      )
      displayTimeSeconds.value = liveTimeSeconds.value
      displayTimeIndex.value = liveTimeIndex.value
      lastRealtimeTick = Date.now()
      lastOrbitUpdateIndex = -1
      viewer.value.clock.shouldAnimate = !buffering.value && !playbackCompleted.value
      if (topologyEnabled.value) refreshTopologyLinks(liveTimeIndex.value)
    }

    function refreshTopologyLinks(timeIndex) {
      if (!topologyEnabled.value || disposed) return Promise.resolve([])
      return fetchTopologyLinks({
        timeIndex,
        includeSimulatedLinks: includeSimulatedLinks.value
      }).catch(() => topologyState.liveLinks)
    }

    function filterVisibleTopologyLinks(links = []) {
      return includeSimulatedLinks.value
        ? links
        : links.filter((link) => !link.simulated)
    }

    const topologyDisplayError = computed(() => (
      topologyState.linksError || topologyState.threeDError || ''
    ))
    const topologyTaskLinks = computed(() => (
      topologyActiveLinks.value.filter((link) => link.link_type === 'task_stream')
    ))

    const formatAltitude = (value) => (
      Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)} km` : '-'
    )

    const tooltipStyle = computed(() => {
      if (!hoverInfo.value) return {}

      return {
        left: `${hoverInfo.value.x + 14}px`,
        top: `${hoverInfo.value.y + 14}px`
      }
    })

    return {
      cesiumContainer,
      loading,
      hoverInfo,
      satelliteCount,
      ephemerisProgressText,
      playbackText,
      playbackCompleted,
      topologyEnabled,
      includeSimulatedLinks,
      topologyLinkCounts,
      topologyTaskLinks,
      topologyDisplayError,
      trafficLevels,
      reviewMode,
      liveTimeIndex,
      displayTimeIndex,
      displayedTimeText,
      reviewOffsetText,
      ephemerisError,
      formatAltitude,
      tooltipStyle,
      resetCamera,
      restartEphemeris,
      reviewAtTime,
      returnToLive,
      flyToSat
    }
  }
}
</script>

<style scoped>
.cesium-container {
  width: 100vw;
  height: 100vh;
  margin: 0;
  padding: 0;
  overflow: hidden;
  position: relative;
  background: #010309;
}

.cesium-container::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background:
    radial-gradient(circle at 50% 50%, transparent 52%, rgba(0, 0, 0, .24) 88%),
    linear-gradient(90deg, rgba(56, 255, 183, .01), transparent 18%, transparent 84%, rgba(82, 196, 255, .01));
}

.cesium-container::after {
  content: '';
  position: fixed;
  inset: 0;
  z-index: 4;
  pointer-events: none;
  background:
    linear-gradient(180deg, rgba(0, 0, 0, .08), transparent 28%, transparent 74%, rgba(0, 0, 0, .16));
}

#cesiumContainer {
  width: 100%;
  height: 100%;
  position: relative;
  z-index: 0;
}

.hud-title {
  position: fixed;
  top: 26px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
  font-family: 'Microsoft YaHei', 'PingFang SC', Arial, sans-serif;
  text-transform: uppercase;
  color: #dff;
  text-shadow: 0 0 8px rgba(0, 255, 255, .22);
}

.hud-title::before,
.hud-title::after {
  content: '';
  position: absolute;
  top: 26px;
  width: 110px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(56, 255, 183, .38));
}

.hud-title::before {
  right: calc(100% + 22px);
}

.hud-title::after {
  left: calc(100% + 22px);
  transform: scaleX(-1);
}

.hud-title span {
  color: rgba(142, 255, 245, .58);
  font-size: 11px;
}

.hud-title strong {
  color: #fff;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0;
}

.top-toolbar {
  position: fixed;
  top: 84px;
  left: 50%;
  z-index: 12;
  width: min(900px, calc(100vw - 180px));
  display: flex;
  align-items: stretch;
  gap: 28px;
  transform: translateX(-50%);
}

.top-status-bar {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: 86px 86px 150px;
  gap: 8px;
  transform: translateX(-40px);
  pointer-events: none;
  font-family: 'Microsoft YaHei', 'PingFang SC', Arial, sans-serif;
}

.top-status-bar div {
  box-sizing: border-box;
  min-height: 44px;
  padding: 8px 10px;
  background: rgba(2, 18, 28, .2);
  border: 1px solid rgba(82, 196, 255, .14);
  border-radius: 6px;
  box-shadow: inset 0 0 10px rgba(56, 255, 183, .025);
  backdrop-filter: blur(2px);
}

.top-status-bar span {
  display: block;
  color: rgba(201, 255, 247, .48);
  font-size: 11px;
}

.top-status-bar strong {
  display: block;
  margin-top: 3px;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
}

.time-navigation {
  box-sizing: border-box;
  min-width: 0;
  min-height: 44px;
  flex: 1 1 auto;
  display: grid;
  grid-template-columns: 140px minmax(100px, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 6px 11px;
  color: #eaffff;
  background: rgba(2, 18, 28, .26);
  border: 1px solid rgba(82, 196, 255, .2);
  border-radius: 7px;
  backdrop-filter: blur(2px);
  transform: translateX(-140px);
}

.time-navigation.reviewing {
  border-color: rgba(255, 182, 87, .46);
}

.time-copy span,
.time-copy small {
  display: block;
  color: rgba(201, 255, 247, .52);
  font-size: 10px;
}

.time-copy strong {
  display: block;
  margin: 3px 0;
  color: #fff;
  font-size: 12px;
}

.time-navigation input[type='range'] {
  width: 100%;
  accent-color: #38ffb7;
  cursor: pointer;
}

.time-navigation button {
  height: 30px;
  padding: 0 10px;
  color: #1c1306;
  background: #ffb657;
  border: 0;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
}

.live-mark {
  color: #38ffb7;
  font-size: 12px;
  font-weight: 700;
}

.ephemeris-error {
  position: fixed;
  top: 142px;
  left: 50%;
  z-index: 20;
  max-width: min(620px, calc(100vw - 40px));
  padding: 8px 14px;
  transform: translateX(-50%);
  color: #ffd86b;
  background: rgba(42, 24, 5, .82);
  border: 1px solid rgba(255, 216, 107, .38);
  border-radius: 6px;
  font-size: 12px;
  backdrop-filter: blur(8px);
}

.topology-hud {
  position: fixed;
  top: 150px;
  right: 28px;
  z-index: 11;
  box-sizing: border-box;
  width: 242px;
  padding: 10px 11px;
  color: #eaffff;
  background: rgba(2, 18, 28, .42);
  border: 1px solid rgba(82, 196, 255, .22);
  border-radius: 7px;
  backdrop-filter: blur(5px);
  font-family: 'Microsoft YaHei', 'PingFang SC', Arial, sans-serif;
}

.topology-hud.disabled {
  width: 154px;
  background: rgba(2, 18, 28, .24);
}

.topology-toggle,
.simulated-toggle {
  display: flex;
  align-items: center;
  gap: 7px;
  cursor: pointer;
  font-size: 11px;
}

.topology-toggle strong {
  margin-left: auto;
  color: #52c4ff;
  font-size: 13px;
}

.simulated-toggle {
  margin-top: 8px;
  color: rgba(201, 255, 247, .65);
  font-size: 10px;
}

.topology-hud input {
  accent-color: #38ffb7;
}

.topology-counts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
  margin-top: 8px;
}

.topology-counts span {
  padding: 5px 3px;
  color: rgba(226, 255, 251, .68);
  background: rgba(0, 8, 15, .48);
  border: 1px solid rgba(82, 196, 255, .12);
  border-radius: 4px;
  font-size: 9px;
  text-align: center;
}

.task-flow-list {
  margin-top: 8px;
  padding: 7px;
  color: rgba(255, 230, 250, .82);
  background: rgba(255, 79, 216, .07);
  border: 1px solid rgba(255, 79, 216, .3);
  border-radius: 5px;
  font-size: 9px;
}

.task-flow-list > strong,
.task-flow-list > span {
  display: block;
}

.task-flow-list > strong {
  margin-bottom: 5px;
  color: #ff79e3;
  font-size: 10px;
}

.task-flow-list > span {
  padding: 3px 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-flow-list b {
  color: #fff;
  font-size: 12px;
}

.task-flow-list em {
  float: right;
  color: #fff;
  font-style: normal;
}

.traffic-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 8px;
  margin-top: 8px;
  color: rgba(201, 255, 247, .58);
  font-size: 9px;
}

.traffic-legend span {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.traffic-legend i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.topology-hud > small,
.topology-hud > em {
  display: block;
  margin-top: 8px;
  color: rgba(201, 255, 247, .45);
  font-size: 9px;
  font-style: normal;
  line-height: 1.5;
}

.topology-hud > em {
  color: #ffb5c1;
}

.loading-tip {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 1000;
  text-align: center;
}

.loader-ring {
  position: relative;
  width: 128px;
  height: 128px;
  margin: auto;
}

.ring {
  position: absolute;
  width: 100%;
  height: 100%;
  border: 3px solid transparent;
  border-radius: 50%;
  animation: ringRotate 2s ease-in-out infinite;
}

.ring:nth-child(1) {
  border-top-color: #ff3b6b;
}

.ring:nth-child(2) {
  width: 80%;
  height: 80%;
  top: 10%;
  left: 10%;
  border-right-color: #38ffb7;
}

.ring:nth-child(3) {
  width: 60%;
  height: 60%;
  top: 20%;
  left: 20%;
  border-bottom-color: #57a7ff;
}

.loader-text {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 180px;
  transform: translate(-50%, -50%);
  color: #bff;
  font-size: 12px;
  font-family: 'Courier New', monospace;
}

@keyframes ringRotate {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

.corner-decoration {
  position: fixed;
  width: 64px;
  height: 64px;
  z-index: 9;
  pointer-events: none;
  border: 1px solid rgba(68, 255, 230, .16);
  box-shadow: 0 0 10px rgba(0, 255, 255, .04);
}

.corner-tl {
  top: 20px;
  left: 20px;
  border-right: none;
  border-bottom: none;
}

.corner-tr {
  top: 20px;
  right: 20px;
  border-left: none;
  border-bottom: none;
}

.corner-bl {
  bottom: 20px;
  left: 20px;
  border-right: none;
  border-top: none;
}

.corner-br {
  right: 20px;
  bottom: 20px;
  border-left: none;
  border-top: none;
}

.scanlines-overlay {
  position: fixed;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  background:
    radial-gradient(circle at center, transparent 38%, rgba(0, 0, 0, .08) 100%),
    repeating-linear-gradient(
      0deg,
      rgba(255, 255, 255, .006) 0,
      rgba(255, 255, 255, .006) 1px,
      transparent 1px,
      transparent 5px
    );
}

.solar-flare {
  position: fixed;
  top: -64px;
  right: -52px;
  z-index: 2;
  width: 190px;
  height: 190px;
  pointer-events: none;
  border-radius: 50%;
  background:
    radial-gradient(circle, rgba(255, 244, 205, .72) 0, rgba(255, 226, 130, .24) 10%, rgba(255, 198, 80, .08) 26%, transparent 58%),
    radial-gradient(circle, rgba(126, 205, 255, .08), transparent 68%);
  filter: blur(.2px);
  mix-blend-mode: screen;
  opacity: .58;
}

.reset-btn {
  position: fixed;
  right: 30px;
  bottom: 30px;
  z-index: 10;
  padding: 10px 18px;
  color: #cffff7;
  background: rgba(0, 20, 28, .58);
  border: 1px solid rgba(56, 255, 183, .34);
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-family: 'Microsoft YaHei', 'PingFang SC', Arial, sans-serif;
  box-shadow: inset 0 0 12px rgba(56, 255, 183, .04);
  backdrop-filter: blur(8px);
  transition: .2s;
}

.reset-btn:hover {
  background: rgba(0, 60, 66, .62);
  box-shadow: 0 0 12px rgba(56, 255, 183, .16);
}

.restart-btn {
  position: fixed;
  right: 136px;
  bottom: 30px;
  z-index: 10;
  padding: 10px 18px;
  color: #07131a;
  background: linear-gradient(135deg, #38ffb7, #52c4ff);
  border: 1px solid rgba(82, 196, 255, .7);
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-family: 'Microsoft YaHei', 'PingFang SC', Arial, sans-serif;
  box-shadow: 0 0 18px rgba(56, 255, 183, .18);
}

.restart-btn:hover {
  filter: brightness(1.08);
}

.node-tooltip {
  position: fixed;
  z-index: 40;
  min-width: 220px;
  padding: 12px;
  pointer-events: none;
  color: #eaffff;
  background: rgba(2, 18, 28, .88);
  border: 1px solid rgba(56, 255, 183, .42);
  border-radius: 7px;
  box-shadow: 0 14px 34px rgba(0, 0, 0, .35), 0 0 18px rgba(56, 255, 183, .12);
  backdrop-filter: blur(10px);
  font-family: 'Microsoft YaHei', 'PingFang SC', Arial, sans-serif;
}

.tip-title {
  padding-bottom: 8px;
  margin-bottom: 8px;
  color: #38ffb7;
  font-weight: 700;
  border-bottom: 1px solid rgba(82, 196, 255, .18);
}

.tip-row {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  font-size: 12px;
  line-height: 24px;
}

.tip-row span {
  color: rgba(201, 255, 247, .62);
}

.tip-row strong {
  color: #fff;
  font-weight: 600;
}

:deep(.cesium-widget),
:deep(.cesium-viewer) {
  background: #010309;
}

:deep(.cesium-widget canvas) {
  cursor: grab;
}

:deep(.cesium-widget canvas.is-rotating) {
  cursor: grabbing;
}

:deep(.cesium-viewer-toolbar),
:deep(.cesium-performanceDisplay-defaultContainer) {
  display: none !important;
}
</style>
