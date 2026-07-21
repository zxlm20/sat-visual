<template>
  <section class="algorithm-manager">
    <header class="manager-header">
      <div>
        <span class="eyebrow">负载均衡算法</span>
        <h1>算法参数配置</h1>
      </div>
      <button type="button" :disabled="loading" @click="refreshOverview">
        {{ loading ? '刷新中...' : '刷新算法' }}
      </button>
    </header>

    <div v-if="error" class="notice error" role="alert">
      {{ error }}
    </div>

    <div v-if="actionNotice" class="notice success" role="status">
      {{ actionNotice }}
    </div>

    <div class="manager-layout">
      <aside class="algorithm-list" aria-label="算法列表">
        <div class="section-title">
          <strong>后端算法</strong>
          <span>{{ algorithms.length }} 项</span>
        </div>

        <button
          v-for="algorithm in algorithms"
          :key="algorithm.algorithm_id"
          type="button"
          class="algorithm-item"
          :class="{
            active: algorithm.algorithm_id === state.selectedAlgorithmId,
            unavailable: algorithm.runtime_available === false
          }"
          @click="selectAlgorithm(algorithm.algorithm_id)"
        >
          <span class="algorithm-main">
            <strong>{{ algorithm.name || algorithm.algorithm_id }}</strong>
            <small>{{ algorithm.algorithm_id }}</small>
          </span>
          <span class="runtime-badge" :class="{ off: algorithm.runtime_available === false }">
            {{ algorithm.runtime_available === false ? '不可用' : '可运行' }}
          </span>
        </button>

        <div v-if="!loading && algorithms.length === 0" class="empty-box">
          后端暂未返回算法列表
        </div>
      </aside>

      <main class="algorithm-detail">
        <div v-if="selectedAlgorithm" class="detail-grid">
          <section class="detail-panel summary-panel">
            <div>
              <span class="eyebrow">当前选择</span>
              <h2>{{ selectedAlgorithm.name || selectedAlgorithm.algorithm_id }}</h2>
              <p>{{ selectedAlgorithm.description || '后端未提供算法说明' }}</p>
            </div>

            <dl>
              <div>
                <dt>算法 ID</dt>
                <dd>{{ selectedAlgorithm.algorithm_id }}</dd>
              </div>
              <div>
                <dt>版本</dt>
                <dd>{{ selectedAlgorithm.version || '-' }}</dd>
              </div>
              <div>
                <dt>插件类型</dt>
                <dd>{{ selectedAlgorithm.plugin_type || '-' }}</dd>
              </div>
              <div>
                <dt>Legacy ID</dt>
                <dd>{{ selectedAlgorithm.legacy_id || '-' }}</dd>
              </div>
            </dl>
          </section>

          <section
            v-if="selectedAlgorithm.runtime_available === false"
            class="notice warning"
            role="status"
          >
            该算法当前不可应用：{{ selectedAlgorithm.runtime_registry_error || 'dispatcher 尚未加载运行时插件' }}
          </section>

          <section class="status-grid">
            <article class="detail-panel status-panel">
              <div class="section-title">
                <strong>下一任务期望配置</strong>
                <span>desired</span>
              </div>
              <dl class="status-list">
                <div>
                  <dt>算法 ID</dt>
                  <dd>{{ desired?.algorithm_id || '-' }}</dd>
                </div>
                <div>
                  <dt>配置版本</dt>
                  <dd>{{ desired?.revision ?? '-' }}</dd>
                </div>
                <div>
                  <dt>更新时间</dt>
                  <dd>{{ formatTime(desired?.updated_at) }}</dd>
                </div>
                <div>
                  <dt>更新来源</dt>
                  <dd>{{ desired?.updated_by || '-' }}</dd>
                </div>
              </dl>
              <pre>{{ formatJson(desired?.parameters || {}) }}</pre>
            </article>

            <article class="detail-panel status-panel">
              <div class="section-title">
                <strong>最近真实执行状态</strong>
                <span>runtime</span>
              </div>
              <div class="state-line">
                <span class="state-badge" :class="runtimeStateClass">
                  {{ formatExecutionState(runtime?.state) }}
                </span>
                <small>{{ revisionMatchText }}</small>
              </div>
              <dl class="status-list">
                <div>
                  <dt>执行 ID</dt>
                  <dd>{{ runtime?.execution_id || '-' }}</dd>
                </div>
                <div>
                  <dt>任务 ID</dt>
                  <dd>{{ runtime?.job_id || '-' }}</dd>
                </div>
                <div>
                  <dt>配置版本</dt>
                  <dd>{{ runtime?.config_revision ?? '-' }}</dd>
                </div>
                <div>
                  <dt>阶段</dt>
                  <dd>{{ runtime?.phase || '-' }}</dd>
                </div>
              </dl>
              <div v-if="runtime?.fallback_used || runtime?.state === 'fallback_succeeded'" class="fallback-box">
                <strong>回退执行</strong>
                <span>请求算法：{{ runtime?.requested_algorithm_id || '-' }}</span>
                <span>实际算法：{{ runtime?.effective_algorithm_id || '-' }}</span>
                <span>回退原因：{{ runtime?.fallback_reason || '后端未返回原因' }}</span>
              </div>
              <div v-if="runtime?.state === 'failed'" class="fallback-box failed">
                <strong>失败原因</strong>
                <span>{{ runtime?.error || runtime?.fallback_error || '负载均衡调度失败' }}</span>
              </div>
            </article>
          </section>

          <section class="detail-panel parameter-panel">
            <div class="section-title">
              <strong>动态参数</strong>
              <span>{{ parameterEntries.length }} 项</span>
            </div>

            <div v-if="parameterEntries.length" class="parameter-list">
              <label
                v-for="entry in parameterEntries"
                :key="entry.name"
                class="parameter-field"
                :class="{ invalid: state.parameterErrors[entry.name] }"
              >
                <span class="field-head">
                  <strong>{{ entry.name }}</strong>
                  <small>{{ formatParameterMeta(entry.definition) }}</small>
                </span>

                <select
                  v-if="entry.definition.enum"
                  :value="state.parameterDraft[entry.name]"
                  @change="updateParameter(entry.name, readFormValue(entry.definition, $event.target.value))"
                >
                  <option value="">请选择</option>
                  <option
                    v-for="item in entry.definition.enum"
                    :key="String(item)"
                    :value="String(item)"
                  >
                    {{ formatParameterValue(item) }}
                  </option>
                </select>

                <span v-else-if="entry.definition.type === 'boolean'" class="switch-field">
                  <input
                    type="checkbox"
                    :checked="Boolean(state.parameterDraft[entry.name])"
                    @change="updateParameter(entry.name, $event.target.checked)"
                  />
                  <em>{{ state.parameterDraft[entry.name] ? '开启' : '关闭' }}</em>
                </span>

                <input
                  v-else-if="entry.definition.type === 'integer'"
                  type="number"
                  step="1"
                  :min="entry.definition.minimum"
                  :max="entry.definition.maximum"
                  :value="state.parameterDraft[entry.name] ?? ''"
                  @input="updateParameter(entry.name, $event.target.value)"
                />

                <input
                  v-else-if="entry.definition.type === 'number'"
                  type="number"
                  step="any"
                  :min="entry.definition.minimum"
                  :max="entry.definition.maximum"
                  :value="state.parameterDraft[entry.name] ?? ''"
                  @input="updateParameter(entry.name, $event.target.value)"
                />

                <input
                  v-else
                  type="text"
                  :value="state.parameterDraft[entry.name] ?? ''"
                  @input="updateParameter(entry.name, $event.target.value)"
                />

                <small v-if="entry.definition.description" class="field-desc">
                  {{ entry.definition.description }}
                </small>
                <small v-if="state.parameterErrors[entry.name]" class="field-error">
                  {{ state.parameterErrors[entry.name] }}
                </small>
              </label>
            </div>

            <div v-else class="empty-box">
              该算法无需配置参数
            </div>

            <div class="form-actions">
              <button type="button" class="secondary" @click="resetDraft">
                恢复后端参数
              </button>
              <button type="button" @click="validateDraft">
                校验参数类型
              </button>
              <button
                type="button"
                class="secondary"
                :disabled="state.loadingStatus"
                @click="refreshRuntime"
              >
                {{ state.loadingStatus ? '刷新中...' : '刷新状态' }}
              </button>
              <button
                type="button"
                :disabled="state.saving || selectedAlgorithm.runtime_available === false"
                @click="applySelectedAlgorithm"
              >
                {{ state.saving ? '保存中...' : '应用到下一任务' }}
              </button>
              <button
                type="button"
                class="secondary"
                :disabled="!waitableRevision || state.polling"
                @click="waitForAppliedRevision"
              >
                {{ state.polling ? '等待中...' : '等待本次配置状态' }}
              </button>
            </div>
          </section>

          <section class="detail-panel payload-panel">
            <div class="section-title">
              <strong>待提交 JSON</strong>
              <span>保持原始类型</span>
            </div>
            <pre>{{ previewJson }}</pre>
          </section>

          <section class="detail-panel result-panel">
            <div class="section-title">
              <strong>最近有效调度结果</strong>
              <button
                type="button"
                class="secondary"
                :disabled="state.loadingResult"
                @click="refreshLatestResult"
              >
                {{ state.loadingResult ? '刷新中...' : '刷新结果' }}
              </button>
            </div>

            <div v-if="latestResult && latestResult.available" class="result-content">
              <dl class="status-list result-meta">
                <div>
                  <dt>执行 ID</dt>
                  <dd>{{ latestResult.execution_id || '-' }}</dd>
                </div>
                <div>
                  <dt>任务 ID</dt>
                  <dd>{{ latestResult.job_id || '-' }}</dd>
                </div>
                <div>
                  <dt>请求算法</dt>
                  <dd>{{ latestResult.requested_algorithm_id || '-' }}</dd>
                </div>
                <div>
                  <dt>实际算法</dt>
                  <dd>{{ latestResult.effective_algorithm_id || '-' }}</dd>
                </div>
                <div>
                  <dt>配置版本</dt>
                  <dd>{{ latestResult.config_revision ?? '-' }}</dd>
                </div>
                <div>
                  <dt>创建时间</dt>
                  <dd>{{ formatTime(latestResult.created_at) }}</dd>
                </div>
              </dl>

              <div v-if="latestResult.fallback_used" class="fallback-box">
                <strong>最近结果发生回退</strong>
                <span>回退原因：{{ latestResult.fallback_reason || '后端未返回原因' }}</span>
              </div>

              <div class="result-grid">
                <article>
                  <div class="section-title compact-title">
                    <strong>节点任务数量</strong>
                    <span>{{ assignedCountEntries.length }} 个节点</span>
                  </div>
                  <div v-if="assignedCountEntries.length" class="assigned-count-list">
                    <span
                      v-for="entry in assignedCountEntries"
                      :key="entry.nodeId"
                    >
                      <b>{{ entry.nodeId }}</b>
                      <em>{{ entry.count }}</em>
                    </span>
                  </div>
                  <div v-else class="empty-box">
                    后端未返回 assigned_count 统计
                  </div>
                </article>

                <article>
                  <div class="section-title compact-title">
                    <strong>执行参数</strong>
                    <span>parameters</span>
                  </div>
                  <pre>{{ formatJson(latestResult.parameters || {}) }}</pre>
                </article>
              </div>

              <div class="assignment-table">
                <div class="assignment-row head">
                  <span>任务块</span>
                  <span>节点</span>
                  <span>顺序</span>
                  <span>决策信息</span>
                </div>
                <div
                  v-for="assignment in latestAssignments"
                  :key="`${assignment.tile_id}-${assignment.node_id}-${assignment.order}`"
                  class="assignment-row"
                >
                  <span>{{ assignment.tile_id || '-' }}</span>
                  <span>{{ assignment.node_id || '-' }}</span>
                  <span>{{ assignment.order ?? '-' }}</span>
                  <span>{{ formatCompactJson(assignment.decision || {}) }}</span>
                </div>
              </div>

              <div v-if="latestAssignments.length === 0" class="empty-box">
                最近结果没有 assignment 明细
              </div>
            </div>

            <div v-else-if="latestResult && latestResult.available === false" class="empty-box">
              后端暂无最近有效调度结果
            </div>

            <div v-else class="empty-box">
              尚未查询最近有效调度结果
            </div>
          </section>
        </div>

        <div v-else class="empty-state">
          <strong>{{ loading ? '正在加载算法列表' : '请选择算法' }}</strong>
          <span>{{ loading ? '正在从后端读取 /api/lb/algorithms 和 /api/lb/current' : '左侧算法来自后端返回，不使用硬编码列表' }}</span>
        </div>
      </main>
    </div>
  </section>
</template>

<script>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  initialLoadBalancingParameters,
  useLoadBalancingAlgorithmStore
} from '@/store/loadBalancingAlgorithmStore'

export default {
  name: 'AlgorithmManager',
  setup() {
    const {
      state,
      algorithms,
      selectedAlgorithm,
      desired,
      runtime,
      latestResult,
      latestAssignments,
      latestAssignedCount,
      loading,
      error,
      fetchOverview,
      fetchExecutionStatus,
      fetchLatestResult,
      selectAlgorithm,
      updateParameterDraft,
      buildParameters,
      switchSelectedAlgorithm,
      waitForRevision,
      stopPollingStatus
    } = useLoadBalancingAlgorithmStore()

    const actionNotice = ref('')

    const parameterEntries = computed(() => (
      Object.entries(selectedAlgorithm.value?.parameters || {}).map(([name, definition]) => ({
        name,
        definition
      }))
    ))

    const normalizedPreview = computed(() => {
      if (!selectedAlgorithm.value) return {}

      try {
        return buildParameters(selectedAlgorithm.value)
      } catch (_) {
        return state.parameterDraft
      }
    })

    const previewJson = computed(() => JSON.stringify({
      algorithm_id: selectedAlgorithm.value?.algorithm_id || '',
      parameters: normalizedPreview.value
    }, null, 2))

    const waitableRevision = computed(() => (
      state.lastAppliedRevision || desired.value?.revision || null
    ))

    const runtimeStateClass = computed(() => runtime.value?.state || 'idle')

    const revisionMatchText = computed(() => {
      if (!runtime.value?.config_revision || !desired.value?.revision) {
        return '尚无可匹配的配置版本'
      }

      return runtime.value.config_revision === desired.value.revision
        ? '状态属于当前期望配置'
        : '状态来自旧配置，不能当作本次结果'
    })

    const assignedCountEntries = computed(() => (
      Object.entries(latestAssignedCount.value || {}).map(([nodeId, count]) => ({
        nodeId,
        count
      }))
    ))

    const refreshOverview = async () => {
      actionNotice.value = ''
      try {
        await Promise.all([
          fetchOverview(),
          fetchLatestResult()
        ])
      } catch (_) {
        // Store 已写入 error，这里避免重复提示。
      }
    }

    const updateParameter = (name, value) => {
      actionNotice.value = ''
      updateParameterDraft(name, value)
    }

    const resetDraft = () => {
      if (!selectedAlgorithm.value) return
      state.parameterDraft = initialLoadBalancingParameters(selectedAlgorithm.value)
      state.parameterErrors = {}
      actionNotice.value = '已恢复后端保存参数和默认参数'
    }

    const validateDraft = () => {
      if (!selectedAlgorithm.value) return

      try {
        buildParameters(selectedAlgorithm.value)
        actionNotice.value = '参数校验通过，提交时会保持正确 JSON 类型'
      } catch (err) {
        actionNotice.value = ''
      }
    }

    const applySelectedAlgorithm = async () => {
      actionNotice.value = ''
      try {
        const data = await switchSelectedAlgorithm()
        actionNotice.value = data?.message || '已保存，从下一任务开始生效'
      } catch (err) {
        state.error = err?.message || '应用负载均衡算法失败'
      }
    }

    const refreshRuntime = async () => {
      actionNotice.value = ''
      try {
        await fetchExecutionStatus()
      } catch (_) {
        // Store 已写入 error，这里避免重复提示。
      }
    }

    const refreshLatestResult = async () => {
      actionNotice.value = ''
      try {
        await fetchLatestResult()
      } catch (_) {
        // Store 已写入 error，这里避免重复提示。
      }
    }

    const waitForAppliedRevision = async () => {
      if (!waitableRevision.value) return

      actionNotice.value = ''
      try {
        const status = await waitForRevision(waitableRevision.value)
        actionNotice.value = status
          ? `配置版本 ${waitableRevision.value} 已进入终态：${formatExecutionState(status.state)}`
          : `等待期内没有发现配置版本 ${waitableRevision.value} 的新任务终态`
      } catch (_) {
        // Store 已写入 error，这里避免重复提示。
      }
    }

    const readFormValue = (definition, rawValue) => {
      if (!definition.enum) return rawValue
      const matched = definition.enum.find((item) => String(item) === rawValue)
      return matched === undefined ? rawValue : matched
    }

    const formatParameterValue = (value) => {
      if (typeof value === 'boolean') return value ? 'true' : 'false'
      return String(value)
    }

    const formatParameterMeta = (definition) => {
      const parts = [definition.type || 'string']
      if (definition.required) parts.push('必填')
      if (definition.minimum !== undefined) parts.push(`最小 ${definition.minimum}`)
      if (definition.maximum !== undefined) parts.push(`最大 ${definition.maximum}`)
      if (Object.prototype.hasOwnProperty.call(definition, 'default')) {
        parts.push(`默认 ${formatParameterValue(definition.default)}`)
      }
      return parts.join(' / ')
    }

    const formatExecutionState = (stateValue) => {
      const labels = {
        idle: '等待任务',
        running: '调度执行中',
        succeeded: '调度成功',
        fallback_succeeded: '已回退并成功',
        failed: '调度失败'
      }
      return labels[stateValue] || stateValue || '等待任务'
    }

    const formatTime = (value) => {
      if (!value) return '-'
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return String(value)
      return date.toLocaleString()
    }

    const formatJson = (value) => JSON.stringify(value || {}, null, 2)
    const formatCompactJson = (value) => JSON.stringify(value || {})

    onMounted(refreshOverview)
    onBeforeUnmount(stopPollingStatus)

    return {
      state,
      algorithms,
      selectedAlgorithm,
      desired,
      runtime,
      latestResult,
      latestAssignments,
      loading,
      error,
      actionNotice,
      parameterEntries,
      previewJson,
      waitableRevision,
      runtimeStateClass,
      revisionMatchText,
      assignedCountEntries,
      refreshOverview,
      selectAlgorithm,
      updateParameter,
      resetDraft,
      validateDraft,
      applySelectedAlgorithm,
      refreshRuntime,
      refreshLatestResult,
      waitForAppliedRevision,
      readFormValue,
      formatParameterValue,
      formatParameterMeta,
      formatExecutionState,
      formatTime,
      formatJson,
      formatCompactJson
    }
  }
}
</script>

<style scoped>
.algorithm-manager {
  min-height: 100vh;
  padding: 22px;
  color: #eaffff;
  background:
    radial-gradient(circle at 24% 18%, rgba(56, 255, 183, .12), transparent 24%),
    radial-gradient(circle at 72% 36%, rgba(82, 196, 255, .1), transparent 26%),
    linear-gradient(135deg, #010309, #03131d 52%, #01050a);
}

.manager-header,
.section-title,
.form-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.manager-header {
  margin-bottom: 14px;
}

.eyebrow {
  color: #38ffb7;
  font-size: 12px;
}

h1,
h2,
p {
  margin: 0;
}

h1 {
  margin-top: 5px;
  font-size: 24px;
}

h2 {
  margin-top: 5px;
  font-size: 19px;
}

p {
  margin-top: 10px;
  color: rgba(226, 255, 251, .68);
  font-size: 13px;
  line-height: 1.7;
}

button,
input,
select {
  font: inherit;
}

button {
  min-height: 34px;
  padding: 0 12px;
  color: #041a15;
  background: #38ffb7;
  border: 1px solid rgba(56, 255, 183, .78);
  border-radius: 5px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
}

button:disabled {
  cursor: wait;
  opacity: .55;
}

button.secondary {
  color: rgba(226, 255, 251, .82);
  background: transparent;
  border-color: rgba(82, 196, 255, .34);
}

.notice {
  margin-bottom: 12px;
  padding: 11px 12px;
  border-radius: 7px;
  font-size: 13px;
  line-height: 1.6;
}

.notice.error {
  color: #ffd86b;
  background: rgba(255, 216, 107, .08);
  border: 1px solid rgba(255, 216, 107, .32);
}

.notice.success {
  color: #bfffe8;
  background: rgba(56, 255, 183, .08);
  border: 1px solid rgba(56, 255, 183, .3);
}

.notice.warning {
  margin: 0;
  color: #ffe39a;
  background: rgba(255, 184, 77, .08);
  border: 1px solid rgba(255, 184, 77, .34);
}

.manager-layout {
  display: grid;
  grid-template-columns: 310px minmax(0, 1fr);
  gap: 14px;
  min-height: calc(100vh - 94px);
}

.algorithm-list,
.detail-panel {
  background: rgba(4, 24, 32, .82);
  border: 1px solid rgba(82, 196, 255, .24);
  border-radius: 8px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, .28);
}

.algorithm-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
}

.section-title {
  margin-bottom: 4px;
}

.section-title strong {
  color: #fff;
  font-size: 14px;
}

.section-title span {
  color: rgba(201, 255, 247, .56);
  font-size: 11px;
}

.algorithm-item {
  min-height: 64px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 10px;
  color: #eaffff;
  background: rgba(2, 18, 28, .74);
  border-color: rgba(82, 196, 255, .22);
  text-align: left;
}

.algorithm-item.active,
.algorithm-item:hover {
  color: #fff;
  background: rgba(56, 255, 183, .09);
  border-color: rgba(56, 255, 183, .52);
}

.algorithm-item.unavailable {
  opacity: .74;
}

.algorithm-main {
  min-width: 0;
}

.algorithm-main strong,
.algorithm-main small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.algorithm-main strong {
  font-size: 13px;
}

.algorithm-main small {
  margin-top: 5px;
  color: rgba(201, 255, 247, .54);
  font-size: 11px;
}

.runtime-badge {
  padding: 4px 7px;
  color: #9dffe0;
  background: rgba(56, 255, 183, .08);
  border: 1px solid rgba(56, 255, 183, .26);
  border-radius: 999px;
  font-size: 11px;
}

.runtime-badge.off {
  color: #ffcf74;
  background: rgba(255, 184, 77, .08);
  border-color: rgba(255, 184, 77, .3);
}

.algorithm-detail {
  min-width: 0;
}

.detail-grid {
  display: grid;
  gap: 12px;
}

.detail-panel {
  padding: 14px;
}

.summary-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, .8fr);
  gap: 16px;
}

dl {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}

dl div {
  min-width: 0;
  padding: 9px;
  background: rgba(2, 18, 28, .68);
  border: 1px solid rgba(82, 196, 255, .18);
  border-radius: 6px;
}

dt,
dd {
  margin: 0;
}

dt {
  color: rgba(201, 255, 247, .52);
  font-size: 11px;
}

dd {
  margin-top: 5px;
  overflow: hidden;
  color: #fff;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.parameter-list {
  display: grid;
  gap: 10px;
  margin-top: 10px;
}

.parameter-field {
  display: grid;
  gap: 7px;
  padding: 11px;
  background: rgba(2, 18, 28, .62);
  border: 1px solid rgba(82, 196, 255, .18);
  border-radius: 7px;
}

.parameter-field.invalid {
  border-color: rgba(255, 96, 96, .5);
}

.field-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.field-head strong {
  color: #fff;
  font-size: 13px;
}

.field-head small,
.field-desc {
  color: rgba(201, 255, 247, .54);
  font-size: 11px;
  line-height: 1.5;
}

.field-error {
  color: #ff9caf;
  font-size: 11px;
}

input,
select {
  width: 100%;
  height: 34px;
  padding: 0 9px;
  color: #eaffff;
  background: rgba(1, 10, 17, .82);
  border: 1px solid rgba(82, 196, 255, .3);
  border-radius: 5px;
  outline: none;
}

input:focus,
select:focus {
  border-color: rgba(56, 255, 183, .72);
  box-shadow: 0 0 0 2px rgba(56, 255, 183, .08);
}

.switch-field {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  color: rgba(226, 255, 251, .78);
  font-size: 12px;
}

.switch-field input {
  width: 18px;
  height: 18px;
  accent-color: #38ffb7;
}

.switch-field em {
  font-style: normal;
}

.form-actions {
  margin-top: 12px;
  flex-wrap: wrap;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.status-panel pre,
.payload-panel pre {
  max-height: 240px;
  margin: 10px 0 0;
  overflow: auto;
  padding: 12px;
  color: #c9fff7;
  background: rgba(1, 10, 17, .88);
  border: 1px solid rgba(82, 196, 255, .18);
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.6;
}

.status-list {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 10px;
}

.state-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 10px;
  padding: 10px;
  background: rgba(2, 18, 28, .62);
  border: 1px solid rgba(82, 196, 255, .18);
  border-radius: 6px;
}

.state-line small {
  color: rgba(201, 255, 247, .58);
  font-size: 11px;
  text-align: right;
}

.state-badge {
  flex: 0 0 auto;
  padding: 5px 9px;
  color: #cfd8e3;
  background: rgba(148, 163, 184, .12);
  border: 1px solid rgba(148, 163, 184, .28);
  border-radius: 999px;
  font-size: 12px;
}

.state-badge.running {
  color: #9be7ff;
  background: rgba(82, 196, 255, .1);
  border-color: rgba(82, 196, 255, .34);
}

.state-badge.succeeded {
  color: #9dffe0;
  background: rgba(56, 255, 183, .08);
  border-color: rgba(56, 255, 183, .3);
}

.state-badge.fallback_succeeded {
  color: #ffe39a;
  background: rgba(255, 184, 77, .08);
  border-color: rgba(255, 184, 77, .34);
}

.state-badge.failed {
  color: #ffb3c0;
  background: rgba(255, 77, 109, .08);
  border-color: rgba(255, 77, 109, .34);
}

.fallback-box {
  display: grid;
  gap: 5px;
  margin-top: 10px;
  padding: 10px;
  color: #ffe39a;
  background: rgba(255, 184, 77, .08);
  border: 1px solid rgba(255, 184, 77, .28);
  border-radius: 6px;
  font-size: 12px;
}

.fallback-box.failed {
  color: #ffb3c0;
  background: rgba(255, 77, 109, .08);
  border-color: rgba(255, 77, 109, .28);
}

.fallback-box strong,
.fallback-box span {
  display: block;
}

.result-panel {
  display: grid;
  gap: 12px;
}

.result-content {
  display: grid;
  gap: 12px;
}

.result-grid {
  display: grid;
  grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr);
  gap: 12px;
}

.result-grid article {
  min-width: 0;
  padding: 11px;
  background: rgba(2, 18, 28, .62);
  border: 1px solid rgba(82, 196, 255, .18);
  border-radius: 7px;
}

.compact-title {
  margin-bottom: 9px;
}

.assigned-count-list {
  display: grid;
  gap: 7px;
}

.assigned-count-list span {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 8px 9px;
  color: rgba(226, 255, 251, .78);
  background: rgba(1, 10, 17, .55);
  border: 1px solid rgba(82, 196, 255, .14);
  border-radius: 5px;
}

.assigned-count-list b,
.assigned-count-list em {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.assigned-count-list b {
  color: #fff;
  font-size: 12px;
}

.assigned-count-list em {
  min-width: 34px;
  color: #38ffb7;
  font-style: normal;
  font-weight: 700;
  text-align: right;
}

.assignment-table {
  overflow: hidden;
  border: 1px solid rgba(82, 196, 255, .2);
  border-radius: 7px;
}

.assignment-row {
  display: grid;
  grid-template-columns: minmax(110px, 1fr) minmax(90px, .75fr) 62px minmax(180px, 1.4fr);
  gap: 8px;
  padding: 9px 10px;
  color: rgba(226, 255, 251, .76);
  border-top: 1px solid rgba(82, 196, 255, .12);
  font-size: 12px;
}

.assignment-row.head {
  color: #38ffb7;
  background: rgba(56, 255, 183, .08);
  border-top: 0;
  font-weight: 700;
}

.assignment-row span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-box,
.empty-state {
  padding: 16px;
  color: rgba(226, 255, 251, .66);
  background: rgba(2, 18, 28, .62);
  border: 1px solid rgba(82, 196, 255, .16);
  border-radius: 7px;
  font-size: 12px;
}

.empty-state {
  display: grid;
  place-items: center;
  min-height: 360px;
  text-align: center;
}

.empty-state strong,
.empty-state span {
  display: block;
}

.empty-state strong {
  color: #fff;
  font-size: 18px;
}

.empty-state span {
  margin-top: 8px;
}

@media (max-width: 980px) {
  .manager-layout,
  .summary-panel,
  .status-grid,
  .result-grid {
    grid-template-columns: 1fr;
  }

  .assignment-row {
    grid-template-columns: minmax(0, 1fr) minmax(80px, .6fr) 48px;
  }

  .assignment-row span:last-child {
    grid-column: 1 / -1;
  }
}
</style>
