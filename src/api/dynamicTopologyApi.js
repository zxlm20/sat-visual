/**
 * 动态拓扑与星座筛选 API 封装
 *
 * 封装与 3.6 动态拓扑计算服务相关的全部接口：
 *   1. GET  /api/topology/2d        二维拓扑查询
 *   2. GET  /api/topology/3d        三维拓扑查询
 *   3. GET  /api/topology/dynamic   动态拓扑快照
 *   4. GET  /api/topology/history   动态拓扑历史
 *   5. GET  /api/topology/rules     查询可见性规则
 *   6. PUT  /api/topology/rules     部分更新可见性规则
 *
 * 复用项目现有的 fetch + AbortController 超时模式（参照 src/api/constellationGroupApi.js）。
 */

const API_BASE_URL = process.env.VUE_APP_API_BASE_URL || ''

/**
 * 拼接请求 URL
 * @param {string} path
 * @returns {string}
 */
function joinUrl(path) {
  if (!API_BASE_URL) return path
  return `${API_BASE_URL.replace(/\/$/, '')}${path}`
}

/**
 * 通用 fetch 封装，含超时和错误处理
 *
 * - 使用 AbortController 实现请求超时
 * - 自动解析 JSON 响应体
 * - 非 2xx 响应从响应体中提取 detail/message/error 字段作为错误信息
 * - 支持外部 signal 用于组件销毁时取消
 *
 * @param {string} path - 接口路径
 * @param {object} [options={}] - fetch 选项，额外支持 timeoutMs 字段和 signal
 * @returns {Promise<any>} 解析后的响应数据（204 时返回 null）
 */
async function fetchJson(path, options = {}) {
  const { timeoutMs = 8000, signal: externalSignal, ...fetchOptions } = options
  const controller = new AbortController()
  const timeoutError = new Error(`请求超时（${Math.ceil(timeoutMs / 1000)} 秒）：${path.split('?')[0]}`)
  timeoutError.name = 'RequestTimeoutError'
  const timer = setTimeout(() => {
    if (!controller.signal.aborted) controller.abort(timeoutError)
  }, timeoutMs)

  // 合并外部 signal（用于组件销毁时取消）
  if (externalSignal) {
    externalSignal.addEventListener('abort', () => {
      if (!controller.signal.aborted) controller.abort(externalSignal.reason)
    })
  }

  try {
    const response = await fetch(joinUrl(path), {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(fetchOptions.headers || {})
      }
    })

    // 204 No Content
    if (response.status === 204) return null

    const text = await response.text()
    let data = null
    if (text) {
      try {
        data = JSON.parse(text)
      } catch (_) {
        data = text
      }
    }

    // 非 2xx 响应：提取 detail 字段作为错误信息
    if (!response.ok) {
      const detail = data?.detail || data?.message || data?.error || data
      const detailText = Array.isArray(detail)
        ? detail.map((item) => item?.msg || JSON.stringify(item)).join('；')
        : (typeof detail === 'object' && detail !== null ? JSON.stringify(detail) : detail)
      throw new Error(detailText || `请求失败：HTTP ${response.status}`)
    }

    return data
  } catch (error) {
    if (controller.signal.aborted) throw timeoutError
    throw error
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// 1. 查询二维拓扑
// ---------------------------------------------------------------------------

/**
 * 查询二维拓扑
 *
 * @param {object} [options={}]
 * @param {number} [options.timeIndex=0] - 星历时间序号
 * @param {string} [options.orbitLayer=''] - 轨道层 LEO/MEO/HEO，空表示全部
 * @param {string} [options.constellationId=''] - 星座 ID，空表示全部
 * @param {boolean} [options.includeSimulatedLinks=true] - 是否返回演示链路
 * @param {AbortSignal} [options.signal] - 外部取消信号
 * @returns {Promise<object>}
 */
export async function fetchTopology2d({
  timeIndex = 0,
  orbitLayer = '',
  constellationId = '',
  includeSimulatedLinks = true,
  signal
} = {}) {
  const params = new URLSearchParams()
  params.set('time_index', String(timeIndex))
  if (orbitLayer) params.set('orbit_layer', orbitLayer)
  if (constellationId) params.set('constellation_id', constellationId)
  params.set('include_simulated_links', String(includeSimulatedLinks))
  return fetchJson(`/api/topology/2d?${params}`, { timeoutMs: 20000, signal })
}

// ---------------------------------------------------------------------------
// 2. 查询三维拓扑
// ---------------------------------------------------------------------------

/**
 * 查询三维拓扑
 *
 * @param {object} [options={}]
 * @param {number} [options.timeIndex=0] - 星历时间序号
 * @param {string} [options.orbitLayer=''] - 轨道层 LEO/MEO/HEO，空表示全部
 * @param {string} [options.constellationId=''] - 星座 ID，空表示全部
 * @param {boolean} [options.includeSimulatedLinks=true] - 是否返回演示链路
 * @param {boolean} [options.includeTrajectories=false] - 是否返回轨迹点
 * @param {number} [options.trajectoryStride=240] - 轨迹采样步长
 * @param {number} [options.trajectoryLimit=300] - 单星最多轨迹点
 * @param {AbortSignal} [options.signal] - 外部取消信号
 * @returns {Promise<object>}
 */
export async function fetchTopology3d({
  timeIndex = 0,
  orbitLayer = '',
  constellationId = '',
  includeSimulatedLinks = true,
  includeTrajectories = false,
  trajectoryStride = 240,
  trajectoryLimit = 300,
  signal
} = {}) {
  const params = new URLSearchParams()
  params.set('time_index', String(timeIndex))
  if (orbitLayer) params.set('orbit_layer', orbitLayer)
  if (constellationId) params.set('constellation_id', constellationId)
  params.set('include_simulated_links', String(includeSimulatedLinks))
  params.set('include_trajectories', String(includeTrajectories))
  params.set('trajectory_stride', String(trajectoryStride))
  params.set('trajectory_limit', String(trajectoryLimit))
  return fetchJson(`/api/topology/3d?${params}`, { timeoutMs: 30000, signal })
}

// ---------------------------------------------------------------------------
// 3. 动态拓扑快照
// ---------------------------------------------------------------------------

/**
 * 查询动态拓扑快照
 *
 * @param {object} [options={}]
 * @param {number} [options.timeIndex=0] - 支持小数，如 60.5
 * @param {string} [options.orbitLayer=''] - 轨道层 LEO/MEO/HEO，空表示全部
 * @param {string} [options.constellationId=''] - 星座 ID，空表示全部
 * @param {boolean} [options.includeIsl=true] - 是否包含星间链路
 * @param {boolean} [options.includeGsl=true] - 是否包含星地链路
 * @param {AbortSignal} [options.signal] - 外部取消信号
 * @returns {Promise<{
 *   mode: string,
 *   coordinate_frame: string,
 *   requested_time_index: number,
 *   effective_time_index: number,
 *   sample_interval_seconds: number,
 *   time_offset_seconds: number,
 *   nodes: Array<object>,
 *   links: Array<object>,
 *   summary: {
 *     node_count: number,
 *     satellite_count: number,
 *     ground_count: number,
 *     available_link_count: number,
 *     isl_count: number,
 *     gsl_count: number
 *   },
 *   filters: object,
 *   rules_version: number
 * }>}
 */
export async function fetchDynamicTopology({
  timeIndex = 0,
  orbitLayer = '',
  constellationId = '',
  includeIsl = true,
  includeGsl = true,
  signal
} = {}) {
  const params = new URLSearchParams()
  params.set('time_index', String(timeIndex))
  if (orbitLayer) params.set('orbit_layer', orbitLayer)
  if (constellationId) params.set('constellation_id', constellationId)
  params.set('include_isl', String(includeIsl))
  params.set('include_gsl', String(includeGsl))
  return fetchJson(`/api/topology/dynamic?${params}`, { timeoutMs: 20000, signal })
}

// ---------------------------------------------------------------------------
// 4. 动态拓扑历史
// ---------------------------------------------------------------------------

/**
 * 查询动态拓扑历史帧
 *
 * @param {object} [options={}]
 * @param {number} options.startTimeIndex - 起始时间
 * @param {number} options.endTimeIndex - 结束时间
 * @param {number} options.step - 步长
 * @param {string} [options.orbitLayer=''] - 轨道层
 * @param {string} [options.constellationId=''] - 星座 ID
 * @param {boolean} [options.includeNodes=true] - 是否包含节点
 * @param {boolean} [options.includeLinks=true] - 是否包含链路
 * @param {AbortSignal} [options.signal] - 外部取消信号
 * @returns {Promise<{
 *   mode: string,
 *   start_time_index: number,
 *   end_time_index: number,
 *   step: number,
 *   frame_count: number,
 *   sample_interval_seconds: number,
 *   frames: Array<{
 *     time_index: number,
 *     time_offset_seconds: number,
 *     nodes: Array<object>,
 *     links: Array<object>,
 *     summary: object
 *   }>
 * }>}
 */
export async function fetchTopologyHistory({
  startTimeIndex,
  endTimeIndex,
  step,
  orbitLayer = '',
  constellationId = '',
  includeNodes = true,
  includeLinks = true,
  signal
} = {}) {
  const params = new URLSearchParams()
  params.set('start_time_index', String(startTimeIndex))
  params.set('end_time_index', String(endTimeIndex))
  params.set('step', String(step))
  if (orbitLayer) params.set('orbit_layer', orbitLayer)
  if (constellationId) params.set('constellation_id', constellationId)
  params.set('include_nodes', String(includeNodes))
  params.set('include_links', String(includeLinks))
  return fetchJson(`/api/topology/history?${params}`, { timeoutMs: 60000, signal })
}

// ---------------------------------------------------------------------------
// 5. 查询可见性规则
// ---------------------------------------------------------------------------

/**
 * 查询当前可见性规则
 *
 * @param {AbortSignal} [signal] - 外部取消信号
 * @returns {Promise<object>}
 */
export async function fetchTopologyRules(signal) {
  return fetchJson('/api/topology/rules', { timeoutMs: 15000, signal })
}

// ---------------------------------------------------------------------------
// 6. 部分更新可见性规则
// ---------------------------------------------------------------------------

/**
 * 部分更新可见性规则
 *
 * 未传字段保留当前值。保存成功后应重新 GET 以获取后端归一化结果。
 * 此操作会修改共享后端配置，测试前必须通知项目负责人。
 *
 * @param {object} rules - 规则数据
 * @param {number} [rules.earth_clearance_km]
 * @param {object} [rules.isl]
 * @param {number} [rules.isl.max_distance_km]
 * @param {number} [rules.isl.max_neighbors_per_satellite]
 * @param {boolean} [rules.isl.same_orbit_layer_only]
 * @param {boolean} [rules.isl.same_constellation_only]
 * @param {object} [rules.gsl]
 * @param {number} [rules.gsl.max_distance_km]
 * @param {number} [rules.gsl.max_links_per_ground]
 * @param {object} [rules.ground_stations]
 * @param {AbortSignal} [signal] - 外部取消信号
 * @returns {Promise<object>}
 */
export async function updateTopologyRules(rules, signal) {
  return fetchJson('/api/topology/rules', {
    method: 'PUT',
    timeoutMs: 20000,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rules),
    signal
  })
}
