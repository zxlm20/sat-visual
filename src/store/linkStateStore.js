import { computed, reactive } from 'vue'
import {
  getBusinessFlows,
  getLinkDetail,
  getLinkHistory,
  getLinkStateErrorMessage,
  getLinkStatus,
  getLinkThresholds,
  isAbortError,
  updateLinkThresholds
} from '@/api/linkStateApi'

const DEFAULT_FILTERS = {
  timeIndex: 0,
  orbitLayer: '',
  constellationId: '',
  includeDynamicLinks: true,
  includeOperationalLinks: true,
  nodeId: '',
  linkType: '',
  status: ''
}

const DEFAULT_HISTORY_FILTERS = {
  startTimeIndex: 0,
  endTimeIndex: 10,
  step: 2,
  nodeId: '',
  linkType: ''
}

const state = reactive({
  filters: { ...DEFAULT_FILTERS },
  historyFilters: { ...DEFAULT_HISTORY_FILTERS },
  snapshot: null,
  links: [],
  businessFlowsInSnapshot: [],
  summary: null,
  selectedLinkId: '',
  selectedLink: null,
  thresholds: null,
  thresholdDraft: {},
  history: null,
  historyFrames: [],
  selectedHistoryFrameIndex: 0,
  businessFlows: [],
  businessFlowSource: '',
  loadingStatus: false,
  loadingDetail: false,
  loadingThresholds: false,
  savingThresholds: false,
  loadingHistory: false,
  loadingBusinessFlows: false,
  error: '',
  errorStatus: null,
  detailError: '',
  detailErrorStatus: null,
  thresholdsError: '',
  historyError: '',
  businessFlowError: '',
  cancelMessage: '',
  actionMessage: '',
  updateTime: null
})

let statusController = null
let detailController = null
let thresholdsController = null
let historyController = null
let businessFlowsController = null

function createController(slotName) {
  stopRequest(slotName)
  const controller = new AbortController()

  if (slotName === 'status') statusController = controller
  if (slotName === 'detail') detailController = controller
  if (slotName === 'thresholds') thresholdsController = controller
  if (slotName === 'history') historyController = controller
  if (slotName === 'businessFlows') businessFlowsController = controller

  return controller
}

function getController(slotName) {
  if (slotName === 'status') return statusController
  if (slotName === 'detail') return detailController
  if (slotName === 'thresholds') return thresholdsController
  if (slotName === 'history') return historyController
  if (slotName === 'businessFlows') return businessFlowsController
  return null
}

function clearController(slotName, controller) {
  if (getController(slotName) !== controller) return

  if (slotName === 'status') statusController = null
  if (slotName === 'detail') detailController = null
  if (slotName === 'thresholds') thresholdsController = null
  if (slotName === 'history') historyController = null
  if (slotName === 'businessFlows') businessFlowsController = null
}

function stopRequest(slotName) {
  const controller = getController(slotName)
  if (controller) controller.abort()
  clearController(slotName, controller)
}

function stopAllRequests() {
  stopRequest('status')
  stopRequest('detail')
  stopRequest('thresholds')
  stopRequest('history')
  stopRequest('businessFlows')
}

function setLoading(slotName, value) {
  if (slotName === 'status') state.loadingStatus = value
  if (slotName === 'detail') state.loadingDetail = value
  if (slotName === 'thresholds') state.loadingThresholds = value
  if (slotName === 'history') state.loadingHistory = value
  if (slotName === 'businessFlows') state.loadingBusinessFlows = value
}

function stopTrackedRequest(slotName) {
  const controller = getController(slotName)
  if (!controller) return false
  controller.abort()
  clearController(slotName, controller)
  setLoading(slotName, false)
  return true
}

function cancelAllRequests() {
  const cancelled = [
    stopTrackedRequest('status'),
    stopTrackedRequest('detail'),
    stopTrackedRequest('thresholds'),
    stopTrackedRequest('history'),
    stopTrackedRequest('businessFlows')
  ].some(Boolean)

  if (cancelled) {
    state.savingThresholds = false
    state.cancelMessage = '已取消正在进行的链路请求'
  }

  return cancelled
}

function setError(target, statusTarget, error, fallbackMessage) {
  if (isAbortError(error)) return
  state[target] = getLinkStateErrorMessage(error) || fallbackMessage
  if (statusTarget) state[statusTarget] = error?.status || null
}

function clearMainError() {
  state.error = ''
  state.errorStatus = null
  state.cancelMessage = ''
}

function normalizeNumber(value, fallback = 0) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : fallback
}

function normalizeFilters(filters) {
  return {
    ...filters,
    timeIndex: normalizeNumber(filters.timeIndex, 0),
    includeDynamicLinks: Boolean(filters.includeDynamicLinks),
    includeOperationalLinks: Boolean(filters.includeOperationalLinks)
  }
}

function normalizeHistoryFilters(filters) {
  return {
    ...filters,
    startTimeIndex: normalizeNumber(filters.startTimeIndex, 0),
    endTimeIndex: normalizeNumber(filters.endTimeIndex, 0),
    step: Math.max(0.000001, normalizeNumber(filters.step, 1))
  }
}

function getHistoryFrameCount(filters = state.historyFilters) {
  const normalized = normalizeHistoryFilters(filters)
  if (normalized.endTimeIndex < normalized.startTimeIndex) return 0
  return Math.floor((normalized.endTimeIndex - normalized.startTimeIndex) / normalized.step) + 1
}

function applySnapshot(data) {
  state.snapshot = data || null
  state.links = data?.links || []
  state.businessFlowsInSnapshot = data?.business_flows || []
  state.summary = data?.summary || null
  state.updateTime = Date.now()
}

function applyThresholds(data) {
  state.thresholds = data || null
  state.thresholdDraft = JSON.parse(JSON.stringify(data || {}))
  state.updateTime = Date.now()
}

function applyHistory(data) {
  state.history = data || null
  state.historyFrames = data?.frames || data?.history || data?.snapshots || []
  state.selectedHistoryFrameIndex = state.historyFrames.length ? 0 : -1
  state.updateTime = Date.now()
}

function applyBusinessFlows(data) {
  state.businessFlows = data?.business_flows || []
  state.businessFlowSource = data?.source || ''
  state.updateTime = Date.now()
}

function updateFilters(patch) {
  state.filters = {
    ...state.filters,
    ...patch
  }
}

function resetFilters() {
  state.filters = { ...DEFAULT_FILTERS }
}

function selectLink(link) {
  const linkId = typeof link === 'object' ? link?.id : link
  state.selectedLinkId = String(linkId || '')
  state.selectedLink = typeof link === 'object' ? { ...link } : null
  state.detailError = ''
  state.detailErrorStatus = null
}

function clearSelectedLink() {
  stopRequest('detail')
  state.loadingDetail = false
  state.selectedLinkId = ''
  state.selectedLink = null
  state.detailError = ''
  state.detailErrorStatus = null
}

function updateHistoryFilters(patch) {
  state.historyFilters = {
    ...state.historyFilters,
    ...patch
  }
}

function resetHistoryFilters() {
  state.historyFilters = { ...DEFAULT_HISTORY_FILTERS }
}

function selectHistoryFrame(index) {
  const safeIndex = Math.min(
    Math.max(0, Number(index) || 0),
    Math.max(0, state.historyFrames.length - 1)
  )
  state.selectedHistoryFrameIndex = safeIndex
}

async function fetchStatus() {
  const controller = createController('status')
  state.loadingStatus = true
  clearMainError()

  try {
    const data = await getLinkStatus(normalizeFilters(state.filters), {
      signal: controller.signal
    })
    applySnapshot(data)
    return data
  } catch (error) {
    setError('error', 'errorStatus', error, '查询链路状态失败')
    throw error
  } finally {
    if (getController('status') === controller) {
      state.loadingStatus = false
    }
    clearController('status', controller)
  }
}

async function fetchLinkDetail(linkId = state.selectedLinkId) {
  if (!linkId) {
    state.detailError = '请选择链路'
    state.detailErrorStatus = null
    return null
  }

  const controller = createController('detail')
  state.loadingDetail = true
  state.detailError = ''
  state.detailErrorStatus = null
  state.selectedLinkId = linkId

  try {
    const data = await getLinkDetail(linkId, {
      timeIndex: state.filters.timeIndex
    }, {
      signal: controller.signal
    })
    state.selectedLink = data || null
    return data
  } catch (error) {
    const fallback = error?.status === 404
      ? '该链路在当前时刻不可见'
      : '查询链路详情失败'
    setError('detailError', 'detailErrorStatus', error, fallback)
    throw error
  } finally {
    if (getController('detail') === controller) {
      state.loadingDetail = false
    }
    clearController('detail', controller)
  }
}

async function fetchThresholds() {
  const controller = createController('thresholds')
  state.loadingThresholds = true
  state.thresholdsError = ''

  try {
    const data = await getLinkThresholds({
      signal: controller.signal
    })
    applyThresholds(data)
    return data
  } catch (error) {
    setError('thresholdsError', null, error, '查询链路阈值失败')
    throw error
  } finally {
    if (getController('thresholds') === controller) {
      state.loadingThresholds = false
    }
    clearController('thresholds', controller)
  }
}

async function saveThresholds(patch = state.thresholdDraft) {
  const controller = createController('thresholds')
  state.savingThresholds = true
  state.thresholdsError = ''
  state.actionMessage = ''

  try {
    const data = await updateLinkThresholds(patch, {
      signal: controller.signal
    })
    state.actionMessage = '链路阈值已保存'
    await fetchThresholds()
    return data
  } catch (error) {
    setError('thresholdsError', null, error, '保存链路阈值失败')
    throw error
  } finally {
    state.savingThresholds = false
    clearController('thresholds', controller)
  }
}

async function fetchHistory() {
  const frameCount = getHistoryFrameCount()
  if (frameCount > 120) {
    state.historyError = `单次历史查询预计 ${frameCount} 帧，超过后端 max_history_frames=120`
    throw new Error(state.historyError)
  }

  const controller = createController('history')
  state.loadingHistory = true
  state.historyError = ''

  try {
    const data = await getLinkHistory(normalizeHistoryFilters(state.historyFilters), {
      signal: controller.signal
    })
    applyHistory(data)
    return data
  } catch (error) {
    setError('historyError', null, error, '查询链路历史失败')
    throw error
  } finally {
    if (getController('history') === controller) {
      state.loadingHistory = false
    }
    clearController('history', controller)
  }
}

async function fetchBusinessFlows() {
  const controller = createController('businessFlows')
  state.loadingBusinessFlows = true
  state.businessFlowError = ''

  try {
    const data = await getBusinessFlows({
      signal: controller.signal
    })
    applyBusinessFlows(data)
    return data
  } catch (error) {
    setError('businessFlowError', null, error, '查询最近业务流失败')
    throw error
  } finally {
    if (getController('businessFlows') === controller) {
      state.loadingBusinessFlows = false
    }
    clearController('businessFlows', controller)
  }
}

async function fetchOverview() {
  const results = await Promise.allSettled([
    fetchStatus(),
    fetchThresholds(),
    fetchBusinessFlows()
  ])
  const firstFailure = results.find((result) => result.status === 'rejected')
  if (firstFailure) throw firstFailure.reason
  return results.map((result) => result.value)
}

const selectedHistoryFrame = computed(() => (
  state.historyFrames[state.selectedHistoryFrameIndex] || null
))
const visibleLinkCount = computed(() => state.links.length)
const businessFlowCount = computed(() => state.businessFlows.length)
const loading = computed(() => (
  state.loadingStatus ||
  state.loadingDetail ||
  state.loadingThresholds ||
  state.savingThresholds ||
  state.loadingHistory ||
  state.loadingBusinessFlows
))

export function useLinkStateStore() {
  return {
    state,
    filters: computed(() => state.filters),
    historyFilters: computed(() => state.historyFilters),
    snapshot: computed(() => state.snapshot),
    links: computed(() => state.links),
    summary: computed(() => state.summary),
    selectedLink: computed(() => state.selectedLink),
    thresholds: computed(() => state.thresholds),
    history: computed(() => state.history),
    historyFrames: computed(() => state.historyFrames),
    selectedHistoryFrame,
    businessFlows: computed(() => state.businessFlows),
    businessFlowSource: computed(() => state.businessFlowSource),
    visibleLinkCount,
    businessFlowCount,
    loading,
    updateFilters,
    resetFilters,
    selectLink,
    clearSelectedLink,
    updateHistoryFilters,
    resetHistoryFilters,
    selectHistoryFrame,
    getHistoryFrameCount,
    fetchStatus,
    fetchLinkDetail,
    fetchThresholds,
    saveThresholds,
    fetchHistory,
    fetchBusinessFlows,
    fetchOverview,
    cancelAllRequests,
    stopAllRequests
  }
}
