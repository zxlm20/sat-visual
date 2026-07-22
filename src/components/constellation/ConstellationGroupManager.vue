<!--
  ConstellationGroupManager — 星座分组管理主组件

  功能清单：
    1. 查询全部星座分组和未分配卫星（页面加载自动请求）
    2. 新建星座（填写名称/颜色/描述 → POST）
    3. 编辑星座名称、颜色、描述（选中后修改 → POST）
    4. 管理成员：从未分配列表移动卫星到星座、从星座中移除卫星
    5. 删除星座（二次确认 → DELETE）
    6. 恢复默认星座（二次确认 → POST reset-defaults）
    7. 显示成员数量、轨道层、跨层标识
    8. 后端 400 等错误在界面明显位置展示 detail

  对外接口：
    - emit('select-constellation', constellationId)  — 选中星座变化时触发
    - defineExpose({ selectedGroupId, groups, refresh }) — 供父组件调用

  使用方法：
    <ConstellationGroupManager @select-constellation="onSelect" />
-->

<template>
  <div class="cm-container" :class="{ compact }">
    <!-- ========== 顶部操作栏 ========== -->
    <div class="cm-header">
      <h2 class="cm-title">
        <span class="title-icon">✦</span>
        星座分组管理
      </h2>
      <div class="cm-header-actions">
        <button
          class="cm-btn cm-btn-outline"
          :disabled="store.state.saving"
          @click="confirmResetDefaults"
        >
          {{ store.state.saving ? '处理中...' : '恢复默认' }}
        </button>
        <button
          class="cm-btn cm-btn-primary"
          :disabled="store.state.saving"
          @click="handleSaveAll"
        >
          {{ store.state.saving ? '处理中...' : '保存全部' }}
        </button>
      </div>
    </div>

    <!-- ========== 错误提示横幅 ========== -->
    <div
      v-if="store.state.saveError || store.state.error"
      class="cm-error-banner"
      role="alert"
    >
      <span class="err-icon">⚠️</span>
      <span>{{ store.state.saveError || store.state.error }}</span>
      <span v-if="store.state.saveError && store.state.error" class="err-note">（查询异常也可能影响操作结果）</span>
      <button class="err-close" @click="dismissError">&times;</button>
    </div>

    <!-- ========== 主体：左侧列表 + 右侧详情 ========== -->
    <div class="cm-body">
      <!-- ===== 左侧面板：星座列表 + 未分配卫星 ===== -->
      <aside class="cm-sidebar">
        <!-- 加载中状态 -->
        <div v-if="store.state.loading" class="sidebar-loading">
          <div class="spinner-sm"></div>
          <span>加载中...</span>
        </div>

        <!-- 错误状态 -->
        <div v-else-if="store.state.error" class="sidebar-error">
          <p>{{ store.state.error }}</p>
          <button class="cm-btn cm-btn-sm" @click="refreshData">重试</button>
        </div>

        <!-- 正常列表 -->
        <template v-else>
          <!-- 星座分组列表 -->
          <div class="cm-group-list">
            <div
              v-for="group in store.state.groups"
              :key="group.constellation_id"
              :class="['cm-group-item', { active: selectedId === group.constellation_id }]"
              @click="selectGroup(group)"
            >
              <span
                class="group-dot"
                :style="{ background: group.color || '#38ffb7' }"
              ></span>
              <div class="group-info">
                <div class="group-name-row">
                  <span class="group-name">{{ group.constellation_name }}</span>
                  <span class="group-count">{{ group.member_count }}</span>
                </div>
                <div class="group-layers">
                  <span class="layer-tag" v-for="layer in group.orbit_layers" :key="layer">
                    {{ layer }}
                  </span>
                  <span v-if="group.cross_layer" class="cross-badge" title="跨轨道层">⚡ 跨层</span>
                </div>
              </div>
            </div>

            <!-- 空数据 -->
            <div v-if="!store.state.groups.length" class="list-empty">
              暂无星座分组，点击下方新建
            </div>
          </div>

          <!-- 新建星座按钮 -->
          <button class="cm-btn cm-btn-new" @click="createNewGroup">
            + 新建星座
          </button>

          <!-- 未分配卫星区域 -->
          <div class="unassigned-section">
            <h3 class="unassigned-title">
              未分配卫星
              <span class="count-badge">{{ store.state.unassignedCount }}</span>
            </h3>
            <div
              v-if="!store.state.unassigned.length"
              class="unassigned-empty"
            >
              所有卫星已分配
            </div>
            <div
              v-for="nodeId in store.state.unassigned"
              :key="nodeId"
              class="unassigned-item"
            >
              <span class="node-id">{{ nodeId }}</span>
              <button
                class="cm-btn cm-btn-tiny"
                :disabled="!store.state.groups.length"
                @click="openMoveDialog(nodeId)"
                title="移动至星座"
              >
                移动
              </button>
            </div>
          </div>
        </template>
      </aside>

      <!-- ===== 右侧详情面板 ===== -->
      <main class="cm-detail">
        <!-- 未选中状态 -->
        <div v-if="!editingGroup" class="detail-placeholder">
          <div class="placeholder-icon">◈</div>
          <p>请从左侧选择一个星座进行编辑</p>
        </div>

        <!-- 详情表单 -->
        <div v-else class="detail-form">
          <!-- 表单标题 -->
          <h3 class="detail-title">
            {{ isNewGroup ? '新建星座' : '编辑星座' }}
          </h3>

          <!-- 名称 -->
          <div class="form-row">
            <label class="form-label">名称</label>
            <input
              v-model="editForm.constellation_name"
              class="form-input"
              type="text"
              placeholder="输入星座名称"
              maxlength="64"
            />
          </div>

          <!-- 颜色 -->
          <div class="form-row">
            <label class="form-label">颜色</label>
            <div class="color-picker-row">
              <input
                v-model="editForm.color"
                class="form-input color-input"
                type="text"
                placeholder="#2563eb"
                maxlength="7"
              />
              <input
                v-model="editForm.color"
                class="color-native"
                type="color"
              />
              <span
                class="color-swatch"
                :style="{ background: editForm.color || '#38ffb7' }"
              ></span>
            </div>
          </div>

          <!-- 描述 -->
          <div class="form-row">
            <label class="form-label">描述</label>
            <textarea
              v-model="editForm.description"
              class="form-textarea"
              placeholder="星座描述（可选）"
              rows="2"
              maxlength="200"
            ></textarea>
          </div>

          <!-- 成员列表 -->
          <div class="members-section">
            <h4 class="members-title">
              成员列表
              <span class="count-badge">{{ editForm.members.length }}</span>
            </h4>

            <div
              v-if="!editForm.members.length"
              class="members-empty"
            >
              暂无成员，可从左侧未分配列表移动卫星
            </div>

            <div
              v-for="memberId in editForm.members"
              :key="memberId"
              class="member-item"
            >
              <span class="member-id">{{ memberId }}</span>
              <button
                class="cm-btn cm-btn-tiny cm-btn-danger-text"
                :disabled="store.state.saving"
                @click="confirmRemoveMember(memberId)"
              >
                移除
              </button>
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="form-actions">
            <button
              class="cm-btn cm-btn-primary"
              :disabled="store.state.saving || !editForm.constellation_name.trim()"
              @click="handleSaveGroup"
            >
              {{ store.state.saving ? '保存中...' : '保存' }}
            </button>
            <button
              v-if="!isNewGroup"
              class="cm-btn cm-btn-danger"
              :disabled="store.state.saving"
              @click="confirmDeleteGroup"
            >
              删除星座
            </button>
            <button
              class="cm-btn cm-btn-outline"
              :disabled="store.state.saving"
              @click="cancelEdit"
            >
              取消
            </button>
          </div>
        </div>
      </main>
    </div>

    <!-- ========== 二次确认弹窗 ========== -->
    <Teleport to="body">
      <div
        v-if="showConfirm"
        class="modal-overlay"
        data-function-panel-overlay
        @click.self="cancelConfirm"
      >
        <div class="modal-box" role="dialog">
          <p class="modal-msg">{{ confirmMessage }}</p>
          <div class="modal-actions">
            <button class="cm-btn cm-btn-outline" @click="cancelConfirm">取消</button>
            <button
              class="cm-btn cm-btn-danger"
              :disabled="store.state.saving"
              @click="executeConfirm"
            >
              {{ store.state.saving ? '处理中...' : '确认' }}
            </button>
          </div>
        </div>
      </div>

      <!-- ========== 移动卫星弹窗 ========== -->
      <div
        v-if="showMoveMember"
        class="modal-overlay"
        data-function-panel-overlay
        @click.self="cancelMoveMember"
      >
        <div class="modal-box" role="dialog">
          <p class="modal-msg">
            将卫星 <strong>{{ moveMemberNodeId }}</strong> 移动至：
          </p>
          <div class="move-option-list">
            <div
              v-for="g in store.state.groups"
              :key="g.constellation_id"
              :class="['move-option', { active: moveTargetId === g.constellation_id }]"
              @click="moveTargetId = g.constellation_id"
            >
              <span class="group-dot" :style="{ background: g.color || '#38ffb7' }"></span>
              <span>{{ g.constellation_name }}</span>
              <span v-if="g.constellation_id === selectedId" class="tag-current">当前</span>
            </div>
          </div>
          <div class="modal-actions">
            <button class="cm-btn cm-btn-outline" @click="cancelMoveMember">取消</button>
            <button
              class="cm-btn cm-btn-primary"
              :disabled="!moveTargetId || store.state.saving"
              @click="executeMoveMember"
            >
              {{ store.state.saving ? '移动中...' : '确认移动' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script>
import { reactive, ref, onMounted } from 'vue'
import { useConstellationGroupStore } from '@/store/constellationGroupStore'

/**
 * 默认新星座表单数据
 * constellation_id 为空时 POST 接口会自动生成
 */
function emptyForm() {
  return {
    constellation_id: '',
    constellation_name: '',
    color: '#2563eb',
    description: '',
    members: []
  }
}

export default {
  name: 'ConstellationGroupManager',
  props: {
    compact: {
      type: Boolean,
      default: false
    }
  },
  emits: ['select-constellation'],
  setup(props, { emit }) {
    // =====================================================================
    // Store
    // =====================================================================
    const store = useConstellationGroupStore()

    // =====================================================================
    // 编辑状态
    // =====================================================================
    const editingGroup = ref(false)        // 是否正在编辑（选中或新建）
    const isNewGroup = ref(false)          // 是否新建模式
    const selectedId = ref(null)           // 当前列表中选中的 constellation_id

    /** 编辑中的表单数据，reactive 以便 v-model 双向绑定 */
    const editForm = reactive(emptyForm())

    /** 从 group 对象填充编辑表单 */
    function fillForm(group) {
      editForm.constellation_id = group.constellation_id || ''
      editForm.constellation_name = group.constellation_name || ''
      editForm.color = group.color || '#2563eb'
      editForm.description = group.description || ''
      editForm.members = [...(group.members || [])]
    }

    /** 重置表单为新建默认值 */
    function resetForm() {
      const empty = emptyForm()
      Object.assign(editForm, empty)
    }

    // =====================================================================
    // 确认弹窗状态
    // =====================================================================
    const showConfirm = ref(false)
    const confirmMessage = ref('')
    const confirmType = ref('')    // 'delete' | 'reset' | 'removeMember'
    const confirmPayload = ref(null)

    function openConfirm(msg, type, payload) {
      confirmMessage.value = msg
      confirmType.value = type
      confirmPayload.value = payload
      showConfirm.value = true
    }

    function cancelConfirm() {
      showConfirm.value = false
      confirmMessage.value = ''
      confirmType.value = ''
      confirmPayload.value = null
    }

    function executeConfirm() {
      switch (confirmType.value) {
        case 'delete':
          handleDeleteGroup(confirmPayload.value)
          break
        case 'reset':
          handleResetDefaults()
          break
        case 'removeMember':
          handleRemoveMember(confirmPayload.value)
          break
      }
      cancelConfirm()
    }

    // =====================================================================
    // 移动卫星弹窗状态
    // =====================================================================
    const showMoveMember = ref(false)
    const moveMemberNodeId = ref('')
    const moveTargetId = ref(null)

    /** 打开移动卫星弹窗 */
    function openMoveDialog(nodeId) {
      moveMemberNodeId.value = nodeId
      // 默认选中当前选中的星座
      moveTargetId.value = selectedId.value
      showMoveMember.value = true
    }

    function cancelMoveMember() {
      showMoveMember.value = false
      moveMemberNodeId.value = ''
      moveTargetId.value = null
    }

    async function executeMoveMember() {
      if (!moveTargetId.value || !moveMemberNodeId.value) return
      try {
        await store.moveMember(moveMemberNodeId.value, moveTargetId.value)
        // 如果当前正在编辑某个星座，刷新其成员
        if (editingGroup.value) {
          const updated = store.state.groups.find(
            (g) => g.constellation_id === moveTargetId.value
          )
          if (updated) fillForm(updated)
        }
      } catch (_) {
        // 错误由 store.state.saveError 展示
      }
      cancelMoveMember()
    }

    // =====================================================================
    // 业务方法
    // =====================================================================

    /** 选中一个星座（左侧列表点击） */
    function selectGroup(group) {
      selectedId.value = group.constellation_id
      isNewGroup.value = false
      editingGroup.value = true
      fillForm(group)
      emit('select-constellation', group.constellation_id)
    }

    /** 新建星座 */
    function createNewGroup() {
      selectedId.value = null
      isNewGroup.value = true
      editingGroup.value = true
      resetForm()
      emit('select-constellation', null)
    }

    /** 取消编辑 */
    function cancelEdit() {
      editingGroup.value = false
      isNewGroup.value = false
      selectedId.value = null
      emit('select-constellation', null)
    }

    /** 保存星座（新建或修改） */
    async function handleSaveGroup() {
      if (!editForm.constellation_name.trim()) return
      try {
        if (isNewGroup.value) {
          // 新建 — 不传 constellation_id，后端自动生成
          await store.saveGroup({
            constellation_name: editForm.constellation_name.trim(),
            color: editForm.color,
            description: editForm.description.trim(),
            members: editForm.members
          })
          // 新建成功后从刷新后的列表中查找并选中
          const created = store.state.groups.find(
            g => g.constellation_name === editForm.constellation_name.trim()
          )
          if (created) {
            selectGroup(created)
          } else {
            cancelEdit()
          }
        } else {
          // 修改
          await store.saveGroup({
            constellation_id: editForm.constellation_id,
            constellation_name: editForm.constellation_name.trim(),
            color: editForm.color,
            description: editForm.description.trim(),
            members: editForm.members
          })
          // 修改后保持选中，从刷新后的数据中查找
          const updated = store.state.groups.find(
            g => g.constellation_id === editForm.constellation_id
          )
          if (updated) {
            selectGroup(updated)
          } else {
            cancelEdit()
          }
        }
      } catch (_) {
        // 错误已由 store.state.saveError 展示
      }
    }

    /** 确认删除星座 */
    function confirmDeleteGroup() {
      openConfirm(
        `确定要删除星座「${editForm.constellation_name}」吗？\n该星座内的 ${editForm.members.length} 颗卫星将变为未分配状态。`,
        'delete',
        editForm.constellation_id
      )
    }

    /** 执行删除 */
    async function handleDeleteGroup(constellationId) {
      try {
        await store.deleteGroup(constellationId)
        editingGroup.value = false
        isNewGroup.value = false
        selectedId.value = null
        emit('select-constellation', null)
      } catch (_) {
        // 错误已由 store 管理
      }
    }

    /** 确认移除成员 */
    function confirmRemoveMember(memberId) {
      openConfirm(
        `确定将卫星 ${memberId} 移出「${editForm.constellation_name}」吗？`,
        'removeMember',
        memberId
      )
    }

    /** 执行移除成员 */
    async function handleRemoveMember(memberId) {
      try {
        await store.removeMember(memberId)
        // 刷新当前编辑表单中的成员列表
        if (editingGroup.value) {
          const updated = store.state.groups.find(
            (g) => g.constellation_id === editForm.constellation_id
          )
          if (updated) fillForm(updated)
        }
      } catch (_) {
        // 错误已由 store 管理
      }
    }

    /** 确认恢复默认 */
    function confirmResetDefaults() {
      openConfirm(
        '确定要恢复默认星座配置吗？\n当前所有星座分组将被替换为默认的 6 个星座。',
        'reset',
        null
      )
    }

    /** 执行恢复默认 */
    async function handleResetDefaults() {
      try {
        await store.resetDefaults()
        editingGroup.value = false
        isNewGroup.value = false
        selectedId.value = null
        emit('select-constellation', null)
      } catch (_) {
        // 错误已由 store 管理
      }
    }

    /** 保存全部 */
    async function handleSaveAll() {
      try {
        await store.saveAllGroups(store.state.groups)
      } catch (_) {
        // 错误已由 store 管理
      }
    }

    /** 主动刷新数据 */
    async function refreshData() {
      try {
        await store.fetchGroups()
      } catch (_) {
        // 错误已由 store 管理
      }
    }

    /** 关闭错误提示 */
    function dismissError() {
      store.clearError()
    }

    // =====================================================================
    // 生命周期
    // =====================================================================
    onMounted(() => {
      refreshData()
    })

    // =====================================================================
    // 对外暴露
    // =====================================================================
    // 供父组件通过 ref 访问
    // selectedGroupId — 当前选中的 constellation_id（用于拓扑筛选联动）
    // groups — 当前星座列表
    // refresh — 手动刷新数据
    // (通过 setup return + defineExpose)

    return {
      // store
      store,
      // 编辑状态
      editingGroup,
      isNewGroup,
      selectedId,
      editForm,
      // 确认弹窗
      showConfirm,
      confirmMessage,
      // 移动弹窗
      showMoveMember,
      moveMemberNodeId,
      moveTargetId,
      // 方法
      selectGroup,
      createNewGroup,
      cancelEdit,
      handleSaveGroup,
      confirmDeleteGroup,
      confirmRemoveMember,
      confirmResetDefaults,
      handleSaveAll,
      refreshData,
      dismissError,
      openMoveDialog,
      cancelMoveMember,
      executeMoveMember,
      cancelConfirm,
      executeConfirm
    }
  }
}
</script>

<style scoped>
/* =========================================================================
   星座分组管理 — 深色科技风主题
   参照项目现有配色风格（src/views/satelliteTask/index.vue 等）
   ========================================================================= */

.cm-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  color: #eaffff;
  font-family: 'Microsoft YaHei', 'PingFang SC', Avenir, Helvetica, Arial, sans-serif;
}

.cm-container.compact {
  min-height: 570px;
  overflow: hidden;
  background: rgba(2, 18, 28, .46);
  border: 1px solid rgba(82, 196, 255, .18);
  border-radius: 8px;
}

.cm-container.compact .cm-sidebar {
  width: 250px;
}

.cm-container.compact .cm-detail {
  padding: 16px 20px;
}

/* ---- 顶部操作栏 ---- */
.cm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(82, 196, 255, .14);
}

.cm-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: #fff;
}

.title-icon {
  color: #38ffb7;
  font-size: 14px;
}

.cm-header-actions {
  display: flex;
  gap: 8px;
}

/* ---- 错误横幅 ---- */
.cm-error-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  margin: 0 16px;
  color: #ffbbbb;
  background: rgba(24, 8, 8, .7);
  border: 1px solid rgba(255, 90, 90, .36);
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.5;
}

.err-icon {
  flex-shrink: 0;
  font-size: 14px;
}

.err-close {
  flex-shrink: 0;
  margin-left: auto;
  padding: 0 4px;
  color: rgba(255, 187, 187, .6);
  background: none;
  border: none;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
}

.err-close:hover {
  color: #ffbbbb;
}

/* ---- 主体布局 ---- */
.cm-body {
  display: flex;
  flex: 1;
  min-height: 0;
}

/* ===== 左侧面板 ===== */
.cm-sidebar {
  width: 260px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid rgba(82, 196, 255, .1);
  overflow-y: auto;
}

/* 左侧加载 */
.sidebar-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 32px 16px;
  color: rgba(201, 255, 247, .48);
  font-size: 13px;
}

.spinner-sm {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(56, 255, 183, .18);
  border-top-color: #38ffb7;
  border-radius: 50%;
  animation: spin .8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 左侧错误 */
.sidebar-error {
  padding: 24px 16px;
  text-align: center;
}

.sidebar-error p {
  color: #ffbbbb;
  font-size: 12px;
  margin-bottom: 10px;
  word-break: break-all;
}

/* ---- 星座列表 ---- */
.cm-group-list {
  flex: 1;
  padding: 8px 0;
}

.cm-group-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  cursor: pointer;
  border-left: 3px solid transparent;
  transition: background .15s, border-color .15s;
}

.cm-group-item:hover {
  background: rgba(82, 196, 255, .08);
}

.cm-group-item.active {
  background: rgba(56, 255, 183, .08);
  border-left-color: #38ffb7;
}

.group-dot {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
  border-radius: 50%;
  box-shadow: 0 0 6px rgba(0, 0, 0, .3);
}

.group-info {
  flex: 1;
  min-width: 0;
}

.group-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.group-name {
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-count {
  flex-shrink: 0;
  min-width: 18px;
  padding: 0 4px;
  font-size: 11px;
  font-weight: 600;
  color: #041015;
  background: rgba(56, 255, 183, .7);
  border-radius: 3px;
  text-align: center;
  line-height: 16px;
}

.group-layers {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 3px;
}

.layer-tag {
  padding: 0 5px;
  font-size: 10px;
  color: rgba(226, 255, 251, .6);
  background: rgba(82, 196, 255, .12);
  border: 1px solid rgba(82, 196, 255, .18);
  border-radius: 3px;
  line-height: 16px;
}

.cross-badge {
  font-size: 10px;
  color: #fbbf24;
  line-height: 16px;
}

/* ---- 列表空状态 ---- */
.list-empty {
  padding: 24px 16px;
  text-align: center;
  color: rgba(201, 255, 247, .38);
  font-size: 12px;
}

/* ---- 新建星座按钮 ---- */
.cm-btn-new {
  display: block;
  width: calc(100% - 28px);
  margin: 4px 14px 12px;
  padding: 8px 0;
  color: #52c4ff;
  background: rgba(82, 196, 255, .08);
  border: 1px dashed rgba(82, 196, 255, .32);
  border-radius: 5px;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  transition: background .15s;
}

.cm-btn-new:hover {
  background: rgba(82, 196, 255, .18);
}

/* ---- 未分配卫星区域 ---- */
.unassigned-section {
  border-top: 1px solid rgba(82, 196, 255, .1);
  padding: 10px 14px;
}

.unassigned-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: rgba(226, 255, 251, .7);
  margin-bottom: 8px;
}

.count-badge {
  min-width: 16px;
  padding: 0 4px;
  font-size: 10px;
  font-weight: 600;
  color: #010309;
  background: rgba(82, 196, 255, .6);
  border-radius: 3px;
  text-align: center;
  line-height: 15px;
}

.unassigned-empty {
  padding: 12px 0;
  text-align: center;
  color: rgba(201, 255, 247, .32);
  font-size: 11px;
}

.unassigned-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 5px 4px;
  border-bottom: 1px solid rgba(82, 196, 255, .06);
}

.unassigned-item:last-child {
  border-bottom: none;
}

.node-id {
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 11px;
  color: rgba(226, 255, 251, .72);
}

/* ================================================================
   右侧详情面板
   ================================================================ */

.cm-detail {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 20px 24px;
}

/* 未选中占位 */
.detail-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 100%;
  min-height: 240px;
  color: rgba(201, 255, 247, .32);
  user-select: none;
}

.placeholder-icon {
  font-size: 32px;
  opacity: .4;
}

.detail-placeholder p {
  font-size: 13px;
}

/* ---- 表单 ---- */
.detail-title {
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  margin-bottom: 18px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(82, 196, 255, .1);
}

.form-row {
  margin-bottom: 14px;
}

.form-label {
  display: block;
  margin-bottom: 5px;
  font-size: 12px;
  font-weight: 600;
  color: rgba(226, 255, 251, .72);
}

.form-input {
  width: 100%;
  height: 34px;
  padding: 0 10px;
  color: #eaffff;
  background: rgba(2, 18, 28, .68);
  border: 1px solid rgba(82, 196, 255, .22);
  border-radius: 5px;
  font: inherit;
  font-size: 13px;
  outline: none;
  transition: border-color .15s;
}

.form-input:focus {
  border-color: #38ffb7;
}

.form-input::placeholder {
  color: rgba(201, 255, 247, .26);
}

.form-textarea {
  width: 100%;
  padding: 8px 10px;
  color: #eaffff;
  background: rgba(2, 18, 28, .68);
  border: 1px solid rgba(82, 196, 255, .22);
  border-radius: 5px;
  font: inherit;
  font-size: 13px;
  outline: none;
  resize: vertical;
  min-height: 52px;
  transition: border-color .15s;
}

.form-textarea:focus {
  border-color: #38ffb7;
}

.form-textarea::placeholder {
  color: rgba(201, 255, 247, .26);
}

/* 颜色选择行 */
.color-picker-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.color-input {
  flex: 1;
  min-width: 0;
}

.color-native {
  width: 34px;
  height: 34px;
  padding: 0;
  border: 1px solid rgba(82, 196, 255, .22);
  border-radius: 5px;
  background: transparent;
  cursor: pointer;
}

.color-native::-webkit-color-swatch-wrapper {
  padding: 2px;
}

.color-native::-webkit-color-swatch {
  border: 1px solid rgba(255, 255, 255, .1);
  border-radius: 3px;
}

.color-swatch {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, .15);
  flex-shrink: 0;
  box-shadow: 0 0 8px rgba(0, 0, 0, .3);
}

/* ---- 成员列表 ---- */
.members-section {
  margin-top: 6px;
  margin-bottom: 16px;
}

.members-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: rgba(226, 255, 251, .7);
  margin-bottom: 8px;
}

.members-empty {
  padding: 16px 0;
  text-align: center;
  color: rgba(201, 255, 247, .32);
  font-size: 12px;
}

.member-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  margin-bottom: 3px;
  background: rgba(2, 18, 28, .48);
  border: 1px solid rgba(82, 196, 255, .08);
  border-radius: 4px;
}

.member-id {
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 12px;
  color: rgba(226, 255, 251, .82);
}

/* ---- 表单按钮 ---- */
.form-actions {
  display: flex;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid rgba(82, 196, 255, .1);
}

/* ================================================================
   通用按钮
   ================================================================ */

.cm-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 30px;
  padding: 0 14px;
  border-radius: 5px;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  transition: background .15s, box-shadow .15s, opacity .15s;
  border: 1px solid transparent;
}

.cm-btn:disabled {
  opacity: .45;
  cursor: not-allowed;
}

.cm-btn-primary {
  color: #041015;
  background: linear-gradient(135deg, #38ffb7, #52c4ff);
  border-color: rgba(56, 255, 183, .7);
}

.cm-btn-primary:hover:not(:disabled) {
  box-shadow: 0 0 14px rgba(56, 255, 183, .24);
}

.cm-btn-outline {
  color: rgba(226, 255, 251, .7);
  background: transparent;
  border-color: rgba(82, 196, 255, .28);
}

.cm-btn-outline:hover:not(:disabled) {
  background: rgba(82, 196, 255, .1);
  border-color: rgba(82, 196, 255, .46);
}

.cm-btn-danger {
  color: #ffbbbb;
  background: rgba(255, 90, 90, .1);
  border-color: rgba(255, 90, 90, .28);
}

.cm-btn-danger:hover:not(:disabled) {
  background: rgba(255, 90, 90, .2);
  border-color: rgba(255, 90, 90, .5);
}

.cm-btn-danger-text {
  color: #ff7a7a;
  background: transparent;
  border-color: transparent;
}

.cm-btn-danger-text:hover:not(:disabled) {
  background: rgba(255, 90, 90, .12);
}

.cm-btn-sm {
  height: 26px;
  padding: 0 10px;
  font-size: 11px;
}

.cm-btn-tiny {
  height: 22px;
  padding: 0 8px;
  font-size: 10px;
  color: rgba(226, 255, 251, .6);
  background: rgba(82, 196, 255, .1);
  border-color: rgba(82, 196, 255, .18);
  border-radius: 3px;
}

.cm-btn-tiny:hover:not(:disabled) {
  background: rgba(82, 196, 255, .22);
}

/* ================================================================
   弹窗覆盖层
   ================================================================ */

.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 4, 8, .62);
  backdrop-filter: blur(3px);
}

.modal-box {
  width: min(380px, calc(100vw - 40px));
  padding: 22px 24px 18px;
  background: rgba(4, 24, 32, .92);
  border: 1px solid rgba(82, 196, 255, .24);
  border-radius: 8px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, .5), 0 0 30px rgba(56, 255, 183, .08);
}

.modal-msg {
  font-size: 13px;
  line-height: 1.7;
  color: rgba(226, 255, 251, .8);
  white-space: pre-line;
  margin-bottom: 18px;
}

.modal-msg strong {
  color: #fff;
  font-weight: 600;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* ---- 移动选项 ---- */
.move-option-list {
  margin-bottom: 16px;
}

.move-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  margin-bottom: 4px;
  border: 1px solid rgba(82, 196, 255, .1);
  border-radius: 5px;
  cursor: pointer;
  font-size: 13px;
  color: rgba(226, 255, 251, .7);
  transition: background .12s, border-color .12s;
}

.move-option:hover {
  background: rgba(82, 196, 255, .08);
  border-color: rgba(82, 196, 255, .24);
}

.move-option.active {
  background: rgba(56, 255, 183, .08);
  border-color: #38ffb7;
  color: #fff;
}

.tag-current {
  margin-left: auto;
  font-size: 10px;
  color: #38ffb7;
  background: rgba(56, 255, 183, .12);
  padding: 0 6px;
  border-radius: 3px;
  line-height: 18px;
}

/* ---- 滚动条美化 ---- */
.cm-sidebar::-webkit-scrollbar,
.cm-detail::-webkit-scrollbar {
  width: 4px;
}

.cm-sidebar::-webkit-scrollbar-track,
.cm-detail::-webkit-scrollbar-track {
  background: transparent;
}

.cm-sidebar::-webkit-scrollbar-thumb,
.cm-detail::-webkit-scrollbar-thumb {
  background: rgba(82, 196, 255, .2);
  border-radius: 2px;
}
</style>
