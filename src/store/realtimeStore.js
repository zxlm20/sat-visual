import { computed, reactive } from 'vue'
import { getStatusWsUrl } from '@/api/backend'
import { useLoadStore } from '@/store/loadStore'
import { useNodeStore } from '@/store/nodeStore'
import { useTopologyStore } from '@/store/topologyStore'

const REFRESH_INTERVAL_MS = 5000

const state = reactive({
  connected: false,
  mode: 'idle',
  error: '',
  updateTime: null
})

let socket = null
let reconnectTimer = null
let pollingTimer = null

function applyStatusPayload(payload = {}) {
  const nodeStore = useNodeStore()
  const loadStore = useLoadStore()
  const topologyStore = useTopologyStore()

  if (payload.nodes) {
    nodeStore.mergeNodeUpdates(payload.nodes)
  }

  if (payload.loads) {
    loadStore.setLoads(payload.loads)
    nodeStore.mergeLoads(loadStore.state.nodes)
  }

  if (payload.topology) {
    topologyStore.setTopology(payload.topology)
  }

  state.updateTime = Date.now()
}

async function refreshOnce() {
  const nodeStore = useNodeStore()
  const loadStore = useLoadStore()
  const topologyStore = useTopologyStore()

  const [nodes, loads, topology] = await Promise.allSettled([
    nodeStore.fetchNodes(),
    loadStore.fetchLoadStatus(),
    topologyStore.fetchTopology()
  ])

  if (loads.status === 'fulfilled') {
    nodeStore.mergeLoads(loadStore.state.nodes)
  }

  const failed = [nodes, loads, topology].find((item) => item.status === 'rejected')
  if (failed) {
    throw failed.reason
  }

  state.updateTime = Date.now()
}

function startPolling() {
  if (pollingTimer) return

  state.mode = 'polling'
  refreshOnce().catch((err) => {
    state.error = err?.message || '实时刷新失败'
  })

  pollingTimer = window.setInterval(() => {
    refreshOnce().catch((err) => {
      state.error = err?.message || '实时刷新失败'
    })
  }, REFRESH_INTERVAL_MS)
}

function stopPolling() {
  if (!pollingTimer) return
  window.clearInterval(pollingTimer)
  pollingTimer = null
}

function connectStatusSocket() {
  if (socket || state.connected) return

  try {
    socket = new WebSocket(getStatusWsUrl())
    state.mode = 'ws'
    state.error = ''

    socket.onopen = () => {
      state.connected = true
      state.mode = 'ws'
      stopPolling()
    }

    socket.onmessage = (event) => {
      try {
        applyStatusPayload(JSON.parse(event.data))
      } catch (err) {
        state.error = err?.message || '实时消息解析失败'
      }
    }

    socket.onerror = () => {
      state.error = 'WebSocket 连接异常，已启用轮询刷新'
      startPolling()
    }

    socket.onclose = () => {
      socket = null
      state.connected = false
      startPolling()

      if (!reconnectTimer) {
        reconnectTimer = window.setTimeout(() => {
          reconnectTimer = null
          connectStatusSocket()
        }, REFRESH_INTERVAL_MS)
      }
    }
  } catch (err) {
    state.error = err?.message || 'WebSocket 初始化失败'
    startPolling()
  }
}

function stopRealtime() {
  if (socket) {
    socket.close()
    socket = null
  }

  if (reconnectTimer) {
    window.clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  stopPolling()
  state.connected = false
  state.mode = 'idle'
}

export function useRealtimeStore() {
  return {
    state,
    connected: computed(() => state.connected),
    mode: computed(() => state.mode),
    error: computed(() => state.error),
    applyStatusPayload,
    refreshOnce,
    connectStatusSocket,
    stopRealtime
  }
}
