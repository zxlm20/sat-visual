/**
 * 动态拓扑与星座筛选 — 状态管理
 *
 * 管理筛选条件、星座选项、动态拓扑快照、历史帧、可见性规则
 * 以及各类请求状态和错误信息。
 *
 * 参照 src/store/constellationGroupStore.js 的 reactive + 导出函数模式。
 */

import { reactive } from 'vue'
import {
  fetchDynamicTopology,
  fetchTopologyHistory,
  fetchTopologyRules,
  updateTopologyRules
} from '@/api/dynamicTopologyApi'
import { useConstellationGroupStore } from '@/store/constellationGroupStore'

/** 单次历史查询最大帧数（与后端 max_history_frames 一致） */
const MAX_HISTORY_FRAMES = 120

/** @type {ReturnType<typeof createState>} */
const state = reactive({
  // ---- 筛选条件 ----
  constellationId: '',      // '' 表示"全部星座"
  orbitLayer: '',           // '' 表示"全部轨道层"
  timeIndex: 0,             // 支持小数
  includeIsl: true,
  includeGsl: true,

  // ---- 星座选项（从星座分组 Store 获取） ----
  constellationOptions: [], // [{ id: '', name: '全部星座' }, ...]

  // ---- 快照数据 ----
  snapshot: null,           // dynamic 接口返回的完整响应
  nodes: [],                // 节点列表
  links: [],                // 链路列表
  summary: null,            // { node_count, satellite_count, ground_count, available_link_count, isl_count, gsl_count }

  // ---- 历史数据 ----
  historyFrames: [],        // 历史帧数组
  historyFrameCount: 0,
  historyCurrentIndex: -1,  // 当前查看的帧索引，-1 表示未选择
  historyStartTime: 0,
  historyEndTime: 0,
  historyStep: 1,

  // ---- 规则数据 ----
  rules: null,              // 当前可见性规则
  rulesVersion: 0,

  // ---- 请求状态 ----
  loading: false,
  error: '',
  historyLoading: false,
  historyError: '',
  rulesLoading: false,
  rulesError: '',
  saving: false,
  saveError: '',

  // ---- 取消令牌 ----
  abortController: null
})

// ===========================================================================
// 内部工具
// ===========================================================================

/**
 * 将异常转换为用户友好的提示文案
 *
 * @param {unknown} error - 捕获的异常
 * @param {string} fallback - 兜底文案
 * @returns {string}
 */
function getFriendlyError(error, fallback) {
  if (!error) return fallback
  if (error.name === 'RequestTimeoutError') return error.message
  if (error.message === 'Failed to fetch' || error.name === 'TypeError') {
    return '无法连接后端服务，请检查网络后重试'
  }
  const msg = error.message || ''
  if (/^请求失败：HTTP 4(?:0[1347]|1[0489]|29|3[014]|44|99)/.test(msg)) {
    return '接口不可用，请确认后端版本是否支持该功能'
  }
  if (/^请求失败：HTTP 5/.test(msg)) {
    return `服务器内部错误，请稍后重试（${msg}）`
  }
  return msg || fallback
}

/**
 * 取消当前正在进行的请求
 */
function cancelRequest() {
  if (state.abortController) {
    state.abortController.abort()
    state.abortController = null
  }
}

/**
 * 请求前创建新的 AbortController，旧请求会被取消
 * @returns {AbortController}
 */
function createAbortController() {
  cancelRequest()
  const controller = new AbortController()
  state.abortController = controller
  return controller
}

// ===========================================================================
// 对外方法
// ===========================================================================

/**
 * 从星座分组 Store 加载星座选项列表
 *
 * 确保星座分组数据已加载，然后映射为下拉选项格式。
 * 第一项为"全部星座"（id=''），其余为各星座选项。
 *
 * @returns {Promise<Array<{ id: string, name: string, color?: string }>>}
 */
async function loadConstellationOptions() {
  try {
    const groupStore = useConstellationGroupStore()
    // 自动加载星座分组数据（如果尚未加载）
    if (!groupStore.state.groups || groupStore.state.groups.length === 0) {
      await groupStore.fetchGroups()
    }

    const options = [{ id: '', name: '全部星座' }]
    for (const group of groupStore.state.groups) {
      options.push({
        id: group.constellation_id,
        name: group.constellation_name,
        color: group.color
      })
    }
    state.constellationOptions = options
    return options
  } catch (error) {
    // 星座分组加载失败时，至少保留"全部星座"选项
    state.constellationOptions = [{ id: '', name: '全部星座' }]
    return state.constellationOptions
  }
}

/**
 * 请求动态拓扑快照
 *
 * 使用当前筛选条件请求 /api/topology/dynamic。
 * 如果已有进行中的请求，先取消旧请求。
 *
 * @returns {Promise<object|null>}
 */
async function fetchSnapshot() {
  const controller = createAbortController()
  state.loading = true
  state.error = ''

  try {
    const data = await fetchDynamicTopology({
      timeIndex: state.timeIndex,
      orbitLayer: state.orbitLayer,
      constellationId: state.constellationId,
      includeIsl: state.includeIsl,
      includeGsl: state.includeGsl,
      signal: controller.signal
    })

    state.snapshot = data
    state.nodes = data?.nodes || []
    state.links = data?.links || []
    state.summary = data?.summary || null
    return data
  } catch (error) {
    // AbortError 不弹到界面
    if (error.name === 'AbortError') return null
    state.error = getFriendlyError(error, '查询动态拓扑失败')
    throw error
  } finally {
    state.loading = false
    if (state.abortController === controller) {
      state.abortController = null
    }
  }
}

/**
 * 设置筛选条件
 *
 * 不自动触发请求，只更新筛选状态。
 * 调用方需在需要时手动调用 fetchSnapshot()。
 *
 * @param {object} filters
 * @param {string} [filters.constellationId]
 * @param {string} [filters.orbitLayer]
 * @param {number} [filters.timeIndex]
 * @param {boolean} [filters.includeIsl]
 * @param {boolean} [filters.includeGsl]
 */
function setFilter(filters) {
  if (filters.constellationId !== undefined) state.constellationId = filters.constellationId
  if (filters.orbitLayer !== undefined) state.orbitLayer = filters.orbitLayer
  if (filters.timeIndex !== undefined) state.timeIndex = filters.timeIndex
  if (filters.includeIsl !== undefined) state.includeIsl = filters.includeIsl
  if (filters.includeGsl !== undefined) state.includeGsl = filters.includeGsl
}

/**
 * 查询动态拓扑历史
 *
 * 发送请求前检查帧数是否超过后端限制（120 帧），
 * 超过则不发送请求并提示用户增大步长。
 *
 * @param {object} params
 * @param {number} params.startTimeIndex - 起始时间
 * @param {number} params.endTimeIndex - 结束时间
 * @param {number} params.step - 步长
 * @returns {Promise<object|null>}
 */
async function fetchHistory({ startTimeIndex, endTimeIndex, step }) {
  // 前置检查：起始时间不能大于结束时间
  if (startTimeIndex > endTimeIndex) {
    state.historyError = '起始时间不能大于结束时间'
    throw new Error(state.historyError)
  }

  // 前置检查：步长必须为正数
  if (step <= 0) {
    state.historyError = '步长必须为正数'
    throw new Error(state.historyError)
  }

  // 前置检查：帧数不能超过后端限制
  const frameCount = Math.floor((endTimeIndex - startTimeIndex) / step) + 1
  if (frameCount > MAX_HISTORY_FRAMES) {
    const suggestedStep = Math.ceil((endTimeIndex - startTimeIndex) / MAX_HISTORY_FRAMES)
    state.historyError = `请求帧数（${frameCount}）超过最大限制（${MAX_HISTORY_FRAMES}），请将步长增加到 ${suggestedStep} 以上`
    throw new Error(state.historyError)
  }

  const controller = createAbortController()
  state.historyLoading = true
  state.historyError = ''

  try {
    const data = await fetchTopologyHistory({
      startTimeIndex,
      endTimeIndex,
      step,
      orbitLayer: state.orbitLayer,
      constellationId: state.constellationId,
      signal: controller.signal
    })

    state.historyFrames = data?.frames || []
    state.historyFrameCount = data?.frame_count || 0
    state.historyStartTime = startTimeIndex
    state.historyEndTime = endTimeIndex
    state.historyStep = step

    // 自动选中第一帧
    if (state.historyFrames.length > 0) {
      state.historyCurrentIndex = 0
    } else {
      state.historyCurrentIndex = -1
    }

    return data
  } catch (error) {
    if (error.name === 'AbortError') return null
    state.historyError = getFriendlyError(error, '查询拓扑历史失败')
    throw error
  } finally {
    state.historyLoading = false
    if (state.abortController === controller) {
      state.abortController = null
    }
  }
}

/**
 * 切换到历史中的某一帧
 *
 * @param {number} index - 帧索引（从 0 开始）
 */
function setHistoryFrame(index) {
  if (index < 0 || index >= state.historyFrames.length) return
  state.historyCurrentIndex = index
}

/**
 * 查询可见性规则
 *
 * @returns {Promise<object|null>}
 */
async function fetchRules() {
  const controller = createAbortController()
  state.rulesLoading = true
  state.rulesError = ''

  try {
    const data = await fetchTopologyRules(controller.signal)
    state.rules = data
    state.rulesVersion = data?.version || 0
    return data
  } catch (error) {
    if (error.name === 'AbortError') return null
    state.rulesError = getFriendlyError(error, '查询可见性规则失败')
    throw error
  } finally {
    state.rulesLoading = false
    if (state.abortController === controller) {
      state.abortController = null
    }
  }
}

/**
 * 部分更新可见性规则
 *
 * 保存成功后自动重新 GET 以获取后端归一化结果。
 *
 * @param {object} rules - 规则数据
 * @returns {Promise<object>}
 */
async function updateRules(rules) {
  state.saving = true
  state.saveError = ''

  try {
    const result = await updateTopologyRules(rules)
    // 保存成功后重新 GET，用后端归一化结果回填
    await fetchRules()
    return result
  } catch (error) {
    state.saveError = getFriendlyError(error, '更新可见性规则失败')
    throw error
  } finally {
    state.saving = false
  }
}

/**
 * 清除错误信息
 */
function clearError() {
  state.error = ''
  state.historyError = ''
  state.rulesError = ''
  state.saveError = ''
}

/**
 * 重置所有状态为初始值
 */
function resetState() {
  cancelRequest()
  state.constellationId = ''
  state.orbitLayer = ''
  state.timeIndex = 0
  state.includeIsl = true
  state.includeGsl = true
  state.snapshot = null
  state.nodes = []
  state.links = []
  state.summary = null
  state.historyFrames = []
  state.historyFrameCount = 0
  state.historyCurrentIndex = -1
  state.historyStartTime = 0
  state.historyEndTime = 0
  state.historyStep = 1
  state.rules = null
  state.rulesVersion = 0
  state.loading = false
  state.error = ''
  state.historyLoading = false
  state.historyError = ''
  state.rulesLoading = false
  state.rulesError = ''
  state.saving = false
  state.saveError = ''
}

// ===========================================================================
// 导出
// ===========================================================================

export function useDynamicTopologyStore() {
  return {
    // 状态
    state,

    // 方法
    loadConstellationOptions,
    fetchSnapshot,
    fetchHistory,
    setHistoryFrame,
    fetchRules,
    updateRules,
    setFilter,
    clearError,
    cancelRequest,
    resetState
  }
}
