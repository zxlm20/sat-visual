/**
 * 星座分组配置 API 封装
 *
 * 封装与后端 /api/constellations/groups 相关的全部接口。
 * 复用项目现有的 fetch + AbortController 超时模式（参照 src/api/backend.js）。
 *
 * 共 7 个接口：
 *   1. GET     /api/constellations/groups                       查询全部星座分组和未分配卫星
 *   2. POST    /api/constellations/groups                       新增或修改单个星座
 *   3. PUT     /api/constellations/groups                       一次性保存全部星座配置
 *   4. POST    /api/constellations/groups/move-member           移动单颗卫星到指定星座
 *   5. DELETE  /api/constellations/groups/members/{node_id}     将卫星移出星座
 *   6. DELETE  /api/constellations/groups/{constellation_id}    删除星座
 *   7. POST    /api/constellations/groups/reset-defaults        恢复默认星座
 */

const API_BASE_URL = process.env.VUE_APP_API_BASE_URL || ''

/** 查询接口超时（毫秒） */
const QUERY_TIMEOUT_MS = 8000
/** 写操作接口超时（毫秒） */
const MUTATION_TIMEOUT_MS = 15000

/**
 * 拼接请求 URL
 * @param {string} path - 接口路径，以 / 开头
 * @returns {string} 完整请求地址
 */
function joinUrl(path) {
  if (!API_BASE_URL) return path
  return `${API_BASE_URL.replace(/\/$/, '')}${path}`
}

/**
 * 通用 fetch 封装，含超时和错误处理
 *
 * 参照 src/api/backend.js 的实现模式：
 * - 使用 AbortController 实现请求超时
 * - 自动解析 JSON 响应体
 * - 非 2xx 响应从响应体中提取 detail/message/error 字段作为错误信息
 *
 * @param {string} path - 接口路径
 * @param {object} [options={}] - fetch 选项，额外支持 timeoutMs 字段
 * @returns {Promise<any>} 解析后的响应数据（204 时返回 null）
 */
async function fetchJson(path, options = {}) {
  const { timeoutMs = QUERY_TIMEOUT_MS, ...fetchOptions } = options
  const controller = new AbortController()
  const timeoutError = new Error(`请求超时（${Math.ceil(timeoutMs / 1000)} 秒）：${path.split('?')[0]}`)
  timeoutError.name = 'RequestTimeoutError'
  const timer = setTimeout(() => {
    if (!controller.signal.aborted) controller.abort(timeoutError)
  }, timeoutMs)

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
    // 超时错误使用自定义超时文案
    if (controller.signal.aborted) throw timeoutError
    throw error
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// 1. 查询全部星座分组和未分配卫星
// ---------------------------------------------------------------------------

/**
 * 查询星座分组配置
 *
 * @param {object} [options={}]
 * @param {boolean} [options.includeUnassigned=true] - 是否返回未分配卫星
 * @returns {Promise<{
 *   version: number,
 *   updated_at: number,
 *   groups: Array<{
 *     constellation_id: string,
 *     constellation_name: string,
 *     color: string,
 *     description: string,
 *     members: string[],
 *     member_count: number,
 *     orbit_layers: string[],
 *     cross_layer: boolean
 *   }>,
 *   unassigned: string[],
 *   unassigned_count: number,
 *   source: string,
 *   note: string
 * }>}
 */
export async function fetchConstellationGroups({ includeUnassigned = true } = {}) {
  const params = new URLSearchParams()
  if (includeUnassigned !== undefined) {
    params.set('include_unassigned', String(includeUnassigned))
  }
  const query = params.toString()
  return fetchJson(`/api/constellations/groups${query ? `?${query}` : ''}`, {
    timeoutMs: QUERY_TIMEOUT_MS
  })
}

// ---------------------------------------------------------------------------
// 2. 新增或修改单个星座
// ---------------------------------------------------------------------------

/**
 * 新增或修改单个星座
 *
 * constellation_id 不传时，后端会根据名称自动生成。
 * 同一颗卫星不能同时属于多个星座，否则返回 400。
 *
 * @param {object} group
 * @param {string} [group.constellation_id] - 星座 ID（修改时必传，新建时可选）
 * @param {string} group.constellation_name - 星座名称
 * @param {string} [group.color] - 十六进制颜色
 * @param {string} [group.description] - 描述
 * @param {string[]} [group.members] - 成员卫星 node_id 列表
 * @returns {Promise<object>} 创建/修改后的星座对象
 */
export async function saveConstellationGroup(group) {
  return fetchJson('/api/constellations/groups', {
    method: 'POST',
    timeoutMs: MUTATION_TIMEOUT_MS,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      constellation_id: group.constellation_id,
      constellation_name: group.constellation_name,
      color: group.color,
      description: group.description,
      members: group.members
    })
  })
}

// ---------------------------------------------------------------------------
// 3. 一次性保存全部星座配置
// ---------------------------------------------------------------------------

/**
 * 一次性保存全部星座配置
 *
 * 适用场景：前端星座配置面板拖拽调整完成后，一次性保存整个配置。
 *
 * @param {Array<{
 *   constellation_id: string,
 *   constellation_name: string,
 *   color: string,
 *   description?: string,
 *   members: string[]
 * }>} groups - 全部星座分组数组
 * @returns {Promise<object>}
 */
export async function saveAllConstellationGroups(groups) {
  return fetchJson('/api/constellations/groups', {
    method: 'PUT',
    timeoutMs: MUTATION_TIMEOUT_MS,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groups })
  })
}

// ---------------------------------------------------------------------------
// 4. 移动单颗卫星到指定星座
// ---------------------------------------------------------------------------

/**
 * 移动单颗卫星到指定星座
 *
 * 后端自动将该卫星从原星座移除，保证一颗卫星只属于一个星座。
 *
 * @param {string} nodeId - 卫星 node_id（如 "M003008"）
 * @param {string} constellationId - 目标星座 ID
 * @returns {Promise<{
 *   node_id: string,
 *   constellation_id: string,
 *   constellation_name: string,
 *   constellation: string,
 *   constellation_color: string
 * }>}
 */
export async function moveMemberToConstellation(nodeId, constellationId) {
  return fetchJson('/api/constellations/groups/move-member', {
    method: 'POST',
    timeoutMs: MUTATION_TIMEOUT_MS,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      node_id: nodeId,
      constellation_id: constellationId
    })
  })
}

// ---------------------------------------------------------------------------
// 5. 将卫星移出星座
// ---------------------------------------------------------------------------

/**
 * 将卫星移出星座（变为未分配状态）
 *
 * @param {string} nodeId - 卫星 node_id（如 "M003008"）
 * @returns {Promise<{
 *   node_id: string,
 *   constellation_id: null,
 *   constellation_name: null,
 *   constellation: null
 * }>}
 */
export async function removeMemberFromConstellation(nodeId) {
  return fetchJson(`/api/constellations/groups/members/${encodeURIComponent(nodeId)}`, {
    method: 'DELETE',
    timeoutMs: MUTATION_TIMEOUT_MS
  })
}

// ---------------------------------------------------------------------------
// 6. 删除星座
// ---------------------------------------------------------------------------

/**
 * 删除星座
 *
 * 删除后，该星座内卫星会变成未分配状态。
 *
 * @param {string} constellationId - 星座 ID（如 "constellation-a"）
 * @returns {Promise<object>}
 */
export async function deleteConstellationGroup(constellationId) {
  return fetchJson(`/api/constellations/groups/${encodeURIComponent(constellationId)}`, {
    method: 'DELETE',
    timeoutMs: MUTATION_TIMEOUT_MS
  })
}

// ---------------------------------------------------------------------------
// 7. 恢复默认星座
// ---------------------------------------------------------------------------

/**
 * 恢复默认星座配置
 *
 * 默认配置把 30 颗星分为 6 个业务星座，每个星座约 5 颗卫星，
 * 并且示范跨 MEO / HEO 的分组能力。
 *
 * @returns {Promise<object>}
 */
export async function resetConstellationDefaults() {
  return fetchJson('/api/constellations/groups/reset-defaults', {
    method: 'POST',
    timeoutMs: MUTATION_TIMEOUT_MS
  })
}
