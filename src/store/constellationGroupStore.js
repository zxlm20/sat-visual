/**
 * 星座分组配置状态管理
 *
 * 管理星座分组列表、未分配卫星、加载/错误状态，
 * 并对外提供当前选中的 constellation_id 供拓扑筛选使用。
 *
 * 参照 src/store/constellationStore.js 的 reactive + 导出函数模式。
 */

import { computed, reactive } from 'vue'
import {
  fetchConstellationGroups,
  saveConstellationGroup,
  saveAllConstellationGroups,
  moveMemberToConstellation,
  removeMemberFromConstellation,
  deleteConstellationGroup,
  resetConstellationDefaults
} from '@/api/constellationGroupApi'

/** @type {ReturnType<typeof createState>} */
const state = reactive({
  // ---- 数据 ----
  groups: [],            // 所有星座分组
  unassigned: [],        // 未分配卫星 node_id 列表
  unassignedCount: 0,    // 未分配卫星数量
  version: 0,            // 配置版本号
  updatedAt: null,       // 最后更新时间（Unix 时间戳）
  source: '',            // 数据来源
  note: '',              // 后端备注

  // ---- 选中状态 ----
  selectedGroupId: null, // 当前选中的星座 ID（对外暴露，供拓扑筛选等场景使用）

  // ---- 加载状态 ----
  loading: false,        // 查询加载中
  error: '',             // 查询错误信息

  // ---- 保存状态 ----
  saving: false,         // 写操作进行中
  saveError: ''          // 写操作错误信息
})

// ===========================================================================
// 内部工具
// ===========================================================================

/**
 * 从 fetchConstellationGroups 响应中更新本地状态
 * @param {object} data - 接口返回数据
 */
function applyGroupsData(data) {
  state.groups = data?.groups || []
  state.unassigned = data?.unassigned || []
  state.unassignedCount = data?.unassigned_count ?? state.unassigned.length
  state.version = data?.version ?? 0
  state.updatedAt = data?.updated_at ?? null
  state.source = data?.source || ''
  state.note = data?.note || ''
}

// ===========================================================================
// 对外方法
// ===========================================================================

/**
 * 查询全部星座分组和未分配卫星
 *
 * 加载成功后自动更新 groups / unassigned 等状态。
 * 调用时机：页面初始化、写操作完成后刷新。
 *
 * @returns {Promise<object>} 接口原始响应数据
 */
async function fetchGroups() {
  state.loading = true
  state.error = ''

  try {
    const data = await fetchConstellationGroups()
    applyGroupsData(data)

    // 如果当前选中的星座已不存在，清除选中
    if (state.selectedGroupId && !state.groups.find(
      (g) => g.constellation_id === state.selectedGroupId
    )) {
      state.selectedGroupId = null
    }

    return data
  } catch (error) {
    state.error = error?.message || '查询星座分组失败'
    throw error
  } finally {
    state.loading = false
  }
}

/**
 * 新增或修改单个星座
 *
 * 调用成功后自动刷新列表。
 *
 * @param {object} group - 星座信息
 * @returns {Promise<object>}
 */
async function saveGroup(group) {
  state.saving = true
  state.saveError = ''

  try {
    const result = await saveConstellationGroup(group)
    // 以服务端数据为准，重新拉取
    await fetchGroups()
    return result
  } catch (error) {
    state.saveError = error?.message || '保存星座失败'
    throw error
  } finally {
    state.saving = false
  }
}

/**
 * 一次性保存全部星座配置
 *
 * @param {Array<object>} groups - 全部星座分组
 * @returns {Promise<object>}
 */
async function saveAllGroups(groups) {
  state.saving = true
  state.saveError = ''

  try {
    const result = await saveAllConstellationGroups(groups)
    await fetchGroups()
    return result
  } catch (error) {
    state.saveError = error?.message || '保存全部星座配置失败'
    throw error
  } finally {
    state.saving = false
  }
}

/**
 * 移动单颗卫星到指定星座
 *
 * @param {string} nodeId - 卫星 node_id
 * @param {string} constellationId - 目标星座 ID
 * @returns {Promise<object>}
 */
async function moveMember(nodeId, constellationId) {
  state.saving = true
  state.saveError = ''

  try {
    const result = await moveMemberToConstellation(nodeId, constellationId)
    await fetchGroups()
    return result
  } catch (error) {
    state.saveError = error?.message || '移动卫星失败'
    throw error
  } finally {
    state.saving = false
  }
}

/**
 * 将卫星移出星座（变为未分配）
 *
 * @param {string} nodeId - 卫星 node_id
 * @returns {Promise<object>}
 */
async function removeMember(nodeId) {
  state.saving = true
  state.saveError = ''

  try {
    const result = await removeMemberFromConstellation(nodeId)
    await fetchGroups()
    return result
  } catch (error) {
    state.saveError = error?.message || '移除卫星失败'
    throw error
  } finally {
    state.saving = false
  }
}

/**
 * 删除星座
 *
 * @param {string} constellationId - 星座 ID
 * @returns {Promise<object>}
 */
async function deleteGroup(constellationId) {
  state.saving = true
  state.saveError = ''

  try {
    const result = await deleteConstellationGroup(constellationId)
    // 如果删除的是当前选中星座，清除选中
    if (state.selectedGroupId === constellationId) {
      state.selectedGroupId = null
    }
    await fetchGroups()
    return result
  } catch (error) {
    state.saveError = error?.message || '删除星座失败'
    throw error
  } finally {
    state.saving = false
  }
}

/**
 * 恢复默认星座配置
 *
 * @returns {Promise<object>}
 */
async function resetDefaults() {
  state.saving = true
  state.saveError = ''

  try {
    const result = await resetConstellationDefaults()
    state.selectedGroupId = null
    await fetchGroups()
    return result
  } catch (error) {
    state.saveError = error?.message || '恢复默认星座失败'
    throw error
  } finally {
    state.saving = false
  }
}

/**
 * 设置当前选中的星座 ID
 *
 * 供外部组件（如拓扑筛选）获取当前关注的 constellation_id。
 *
 * @param {string|null} constellationId
 */
function selectGroup(constellationId) {
  state.selectedGroupId = constellationId
}

/**
 * 清除错误信息（用于用户关闭错误提示时调用）
 */
function clearError() {
  state.error = ''
  state.saveError = ''
}

// ===========================================================================
// 导出
// ===========================================================================

export function useConstellationGroupStore() {
  return {
    // 状态（reactive state 可直接访问）
    state,

    // 计算属性
    groups: computed(() => state.groups),
    unassigned: computed(() => state.unassigned),
    unassignedCount: computed(() => state.unassignedCount),
    version: computed(() => state.version),
    selectedGroupId: computed(() => state.selectedGroupId),

    // 方法
    fetchGroups,
    saveGroup,
    saveAllGroups,
    moveMember,
    removeMember,
    deleteGroup,
    resetDefaults,
    selectGroup,
    clearError
  }
}
