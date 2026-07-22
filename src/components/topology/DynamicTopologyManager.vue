<!--
  DynamicTopologyManager — 动态拓扑与星座筛选主组件

  功能：
    1. 筛选栏：星座、轨道层、time_index、ISL/GSL 开关
    2. 快照汇总卡片：节点/卫星/地面/ISL/GSL/可用链路数
    3. 响应时间信息：requested_time_index / effective_time_index / offset
    4. 节点列表（可折叠）：ID、类型、轨道层、星座、ECI 位置、available_link_count
    5. 链路列表（可折叠）：类型、两端、距离、时延、净空/仰角、计算来源
    6. 加载中 / 错误 / 空数据状态

  对外接口：
    - loadConstellationOptions() / fetchSnapshot() 由 onMounted 自动调用
    - defineExpose({ refreshData }) 供父组件调用
-->

<template>
  <div class="dtm-container">
    <!-- ========== 标题 ========== -->
    <div class="dtm-header">
      <h2 class="dtm-title">
        <span class="title-icon">◈</span>
        动态拓扑快照
      </h2>
    </div>

    <!-- ========== 筛选栏 ========== -->
    <div class="dtm-filters">
      <div class="filter-row">
        <!-- 星座 -->
        <div class="filter-item">
          <label class="filter-label">星座</label>
          <select
            v-model="localConstellationId"
            class="filter-select"
            :disabled="store.state.loading"
          >
            <option
              v-for="opt in store.state.constellationOptions"
              :key="opt.id"
              :value="opt.id"
            >
              {{ opt.name }}
            </option>
          </select>
        </div>

        <!-- 轨道层 -->
        <div class="filter-item">
          <label class="filter-label">轨道层</label>
          <select
            v-model="localOrbitLayer"
            class="filter-select"
            :disabled="store.state.loading"
          >
            <option value="">全部</option>
            <option value="LEO">LEO</option>
            <option value="MEO">MEO</option>
            <option value="HEO">HEO</option>
          </select>
        </div>

        <!-- 时间 -->
        <div class="filter-item">
          <label class="filter-label">时间</label>
          <input
            v-model.number="localTimeIndex"
            type="number"
            step="0.1"
            min="0"
            class="filter-input"
            :disabled="store.state.loading"
          />
        </div>

        <!-- ISL 开关 -->
        <div class="filter-item filter-check">
          <label class="filter-checkbox">
            <input
              v-model="localIncludeIsl"
              type="checkbox"
              :disabled="store.state.loading"
            />
            <span class="check-label">ISL</span>
          </label>
        </div>

        <!-- GSL 开关 -->
        <div class="filter-item filter-check">
          <label class="filter-checkbox">
            <input
              v-model="localIncludeGsl"
              type="checkbox"
              :disabled="store.state.loading"
            />
            <span class="check-label">GSL</span>
          </label>
        </div>

        <!-- 查询按钮 -->
        <div class="filter-item filter-action">
          <button
            class="dtm-btn dtm-btn-primary"
            :disabled="store.state.loading"
            @click="handleQuery"
          >
            {{ store.state.loading ? '查询中...' : '查询' }}
          </button>
        </div>
      </div>

      <!-- 时间信息 -->
      <div
        v-if="store.state.snapshot"
        class="time-info"
      >
        请求时间: {{ store.state.snapshot.requested_time_index }}
        &nbsp;|&nbsp; 实际时间: {{ store.state.snapshot.effective_time_index }}
        &nbsp;|&nbsp; 时间偏移: {{ store.state.snapshot.time_offset_seconds }}s
        &nbsp;|&nbsp; 采样间隔: {{ store.state.snapshot.sample_interval_seconds }}s
        &nbsp;|&nbsp; 规则版本: {{ store.state.snapshot.rules_version }}
      </div>
    </div>

    <!-- ========== 错误提示 ========== -->
    <div
      v-if="store.state.error"
      class="dtm-error"
    >
      <span class="error-icon">⚠</span>
      {{ store.state.error }}
      <button class="error-dismiss" @click="store.clearError()">✕</button>
    </div>

    <!-- ========== 加载中 ========== -->
    <div
      v-if="store.state.loading"
      class="dtm-loading"
    >
      <div class="spinner"></div>
      <span>正在查询拓扑...</span>
    </div>

    <!-- ========== 主内容 ========== -->
    <template v-if="!store.state.loading">
      <!-- 空数据 -->
      <div
        v-if="!store.state.snapshot"
        class="dtm-empty"
      >
        <div class="empty-icon">◈</div>
        <p>暂无动态拓扑数据</p>
        <p class="empty-hint">请调整筛选条件后点击"查询"</p>
      </div>

      <template v-else>
        <!-- ========== 快照汇总 ========== -->
        <div
          v-if="store.state.summary"
          class="dtm-summary"
        >
          <div class="summary-card">
            <span class="summary-value">{{ store.state.summary.node_count }}</span>
            <span class="summary-label">节点总数</span>
          </div>
          <div class="summary-card">
            <span class="summary-value">{{ store.state.summary.satellite_count }}</span>
            <span class="summary-label">卫星</span>
          </div>
          <div class="summary-card">
            <span class="summary-value">{{ store.state.summary.ground_count }}</span>
            <span class="summary-label">地面</span>
          </div>
          <div class="summary-card">
            <span class="summary-value">{{ store.state.summary.isl_count }}</span>
            <span class="summary-label">ISL</span>
          </div>
          <div class="summary-card">
            <span class="summary-value">{{ store.state.summary.gsl_count }}</span>
            <span class="summary-label">GSL</span>
          </div>
          <div class="summary-card card-highlight">
            <span class="summary-value">{{ store.state.summary.available_link_count }}</span>
            <span class="summary-label">可用链路</span>
          </div>
        </div>

        <!-- ========== 节点列表 ========== -->
        <div class="dtm-section">
          <div
            class="section-header"
            @click="showNodes = !showNodes"
          >
            <span class="section-toggle">{{ showNodes ? '▼' : '▶' }}</span>
            <span class="section-title">节点列表 ({{ store.state.nodes.length }})</span>
          </div>
          <div v-if="showNodes" class="section-body">
            <div
              v-if="store.state.nodes.length === 0"
              class="section-empty"
            >
              当前条件下无可用节点
            </div>
            <table v-else class="dtm-table">
              <thead>
                <tr>
                  <th>节点 ID</th>
                  <th>类型</th>
                  <th>轨道层</th>
                  <th>星座</th>
                  <th>ECI 位置 (km)</th>
                  <th>速度 (km/s)</th>
                  <th>可用链路</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="node in store.state.nodes" :key="node.node_id">
                  <td class="cell-id">{{ node.node_id }}</td>
                  <td>
                    <span
                      class="type-tag"
                      :class="node.node_type === 'ground' ? 'type-ground' : 'type-satellite'"
                    >
                      {{ node.node_type === 'ground' ? '地面' : '卫星' }}
                    </span>
                  </td>
                  <td>{{ node.orbit_layer || '-' }}</td>
                  <td>{{ node.constellation_id || '-' }}</td>
                  <td class="cell-mono">
                    {{ formatPosition(node.position_eci_km) }}
                  </td>
                  <td class="cell-mono">
                    {{ formatVelocity(node.velocity_eci_km_s) }}
                  </td>
                  <td class="cell-count">{{ node.available_link_count }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- ========== 链路列表 ========== -->
        <div class="dtm-section">
          <div
            class="section-header"
            @click="showLinks = !showLinks"
          >
            <span class="section-toggle">{{ showLinks ? '▼' : '▶' }}</span>
            <span class="section-title">链路列表 ({{ store.state.links.length }})</span>
          </div>
          <div v-if="showLinks" class="section-body">
            <div
              v-if="store.state.links.length === 0"
              class="section-empty"
            >
              当前条件下无可用链路
            </div>
            <table v-else class="dtm-table">
              <thead>
                <tr>
                  <th>类型</th>
                  <th>源</th>
                  <th>目标</th>
                  <th>距离 (km)</th>
                  <th>时延 (ms)</th>
                  <th>净空/仰角</th>
                  <th>计算来源</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="link in store.state.links" :key="link.id">
                  <td>
                    <span
                      class="link-type-tag"
                      :class="link.link_type === 'isl' ? 'type-isl' : 'type-gsl'"
                    >
                      {{ link.link_type.toUpperCase() }}
                    </span>
                  </td>
                  <td class="cell-id">{{ link.source }}</td>
                  <td class="cell-id">{{ link.target }}</td>
                  <td class="cell-num">{{ formatNumber(link.distance_km) }}</td>
                  <td class="cell-num">{{ formatNumber(link.propagation_delay_ms) }}</td>
                  <td class="cell-num">
                    <template v-if="link.link_type === 'isl'">
                      {{ formatNumber(link.earth_clearance_km) }} km
                    </template>
                    <template v-else-if="link.link_type === 'gsl'">
                      {{ formatNumber(link.elevation_deg) }}°
                    </template>
                    <template v-else>-</template>
                  </td>
                  <td class="cell-source">{{ link.calculation_source || '-' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- ========== 历史回放 ========== -->
        <div class="dtm-section">
          <div
            class="section-header"
            @click="showHistory = !showHistory"
          >
            <span class="section-toggle">{{ showHistory ? '▼' : '▶' }}</span>
            <span class="section-title">历史回放</span>
          </div>
          <div v-if="showHistory" class="section-body">
            <!-- 历史查询表单 -->
            <div class="history-form">
              <div class="history-form-row">
                <div class="filter-item">
                  <label class="filter-label">起始时间</label>
                  <input
                    v-model.number="historyStart"
                    type="number"
                    min="0"
                    step="1"
                    class="filter-input"
                    :disabled="store.state.historyLoading"
                  />
                </div>
                <div class="filter-item">
                  <label class="filter-label">结束时间</label>
                  <input
                    v-model.number="historyEnd"
                    type="number"
                    min="0"
                    step="1"
                    class="filter-input"
                    :disabled="store.state.historyLoading"
                  />
                </div>
                <div class="filter-item">
                  <label class="filter-label">步长</label>
                  <input
                    v-model.number="historyStep"
                    type="number"
                    min="1"
                    step="1"
                    class="filter-input"
                    :disabled="store.state.historyLoading"
                  />
                </div>
                <div class="filter-item filter-action">
                  <button
                    class="dtm-btn dtm-btn-secondary"
                    :disabled="store.state.historyLoading"
                    @click="handleQueryHistory"
                  >
                    {{ store.state.historyLoading ? '查询中...' : '查询历史' }}
                  </button>
                </div>
              </div>
            </div>

            <!-- 历史错误 -->
            <div
              v-if="store.state.historyError"
              class="history-error"
            >
              <span class="error-icon">⚠</span>
              {{ store.state.historyError }}
            </div>

            <!-- 历史加载中 -->
            <div
              v-if="store.state.historyLoading"
              class="history-loading"
            >
              <div class="spinner"></div>
              <span>正在查询历史帧...</span>
            </div>

            <!-- 历史已加载 -->
            <template v-if="store.state.historyFrames.length > 0">
              <!-- 帧导航 -->
              <div class="frame-nav">
                <div class="frame-nav-row">
                  <button
                    class="frame-btn"
                    :disabled="store.state.historyCurrentIndex <= 0"
                    @click="goToFirstFrame"
                    title="首帧"
                  >◀◀</button>
                  <button
                    class="frame-btn"
                    :disabled="store.state.historyCurrentIndex <= 0"
                    @click="goToPrevFrame"
                    title="上一帧"
                  >◀</button>

                  <span class="frame-label">
                    第 <strong>{{ store.state.historyCurrentIndex + 1 }}</strong>
                    / {{ store.state.historyFrameCount }} 帧
                  </span>

                  <button
                    class="frame-btn"
                    :disabled="store.state.historyCurrentIndex >= store.state.historyFrames.length - 1"
                    @click="goToNextFrame"
                    title="下一帧"
                  >▶</button>
                  <button
                    class="frame-btn"
                    :disabled="store.state.historyCurrentIndex >= store.state.historyFrames.length - 1"
                    @click="goToLastFrame"
                    title="末帧"
                  >▶▶</button>
                </div>

                <!-- 进度条 -->
                <div class="frame-progress-wrap">
                  <input
                    type="range"
                    class="frame-progress"
                    :min="0"
                    :max="Math.max(0, store.state.historyFrames.length - 1)"
                    :value="store.state.historyCurrentIndex"
                    @input="onFrameSlider"
                  />
                </div>
              </div>

              <!-- 当前帧信息 -->
              <div
                v-if="currentFrame"
                class="frame-info"
              >
                <div class="frame-info-row">
                  <span class="frame-info-item">
                    time_index: <strong>{{ currentFrame.time_index }}</strong>
                  </span>
                  <span class="frame-info-item">
                    time_offset: <strong>{{ currentFrame.time_offset_seconds }}s</strong>
                  </span>
                </div>
                <div class="frame-info-row" v-if="currentFrame.summary">
                  <span class="frame-info-item">
                    节点: <strong>{{ currentFrame.summary.node_count }}</strong>
                  </span>
                  <span class="frame-info-item">
                    链路: <strong>{{ currentFrame.summary.available_link_count }}</strong>
                  </span>
                  <span class="frame-info-item">
                    ISL: <strong>{{ currentFrame.summary.isl_count }}</strong>
                  </span>
                  <span class="frame-info-item">
                    GSL: <strong>{{ currentFrame.summary.gsl_count }}</strong>
                  </span>
                </div>
              </div>

              <!-- 当前帧节点/链路列表 -->
              <div class="frame-detail-grid">
                <div class="frame-detail-col">
                  <div class="frame-detail-title">节点 ({{ currentFrame?.nodes?.length || 0 }})</div>
                  <div
                    v-if="!currentFrame?.nodes?.length"
                    class="section-empty"
                  >
                    无节点
                  </div>
                  <table v-else class="dtm-table">
                    <thead>
                      <tr>
                        <th>节点 ID</th>
                        <th>类型</th>
                        <th>可用链路</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="node in currentFrame.nodes" :key="node.node_id">
                        <td class="cell-id">{{ node.node_id }}</td>
                        <td>
                          <span
                            class="type-tag"
                            :class="node.node_type === 'ground' ? 'type-ground' : 'type-satellite'"
                          >
                            {{ node.node_type === 'ground' ? '地面' : '卫星' }}
                          </span>
                        </td>
                        <td class="cell-count">{{ node.available_link_count }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div class="frame-detail-col">
                  <div class="frame-detail-title">链路 ({{ currentFrame?.links?.length || 0 }})</div>
                  <div
                    v-if="!currentFrame?.links?.length"
                    class="section-empty"
                  >
                    无链路
                  </div>
                  <table v-else class="dtm-table">
                    <thead>
                      <tr>
                        <th>类型</th>
                        <th>源</th>
                        <th>目标</th>
                        <th>距离 (km)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="link in currentFrame.links" :key="link.id">
                        <td>
                          <span
                            class="link-type-tag"
                            :class="link.link_type === 'isl' ? 'type-isl' : 'type-gsl'"
                          >
                            {{ link.link_type.toUpperCase() }}
                          </span>
                        </td>
                        <td class="cell-id">{{ link.source }}</td>
                        <td class="cell-id">{{ link.target }}</td>
                        <td class="cell-num">{{ formatNumber(link.distance_km) }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </template>

            <!-- 历史空状态 -->
            <div
              v-else-if="!store.state.historyLoading && !store.state.historyError"
              class="section-empty"
            >
              请输入起始时间、结束时间和步长后点击"查询历史"
            </div>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<script>
import { computed, onMounted, ref } from 'vue'
import { useDynamicTopologyStore } from '@/store/dynamicTopologyStore'

export default {
  name: 'DynamicTopologyManager',

  setup() {
    const store = useDynamicTopologyStore()

    // 本地筛选条件（确认后同步到 store 再请求）
    const localConstellationId = ref('')
    const localOrbitLayer = ref('')
    const localTimeIndex = ref(0)
    const localIncludeIsl = ref(true)
    const localIncludeGsl = ref(true)

    // 折叠状态
    const showNodes = ref(true)
    const showLinks = ref(true)
    const showHistory = ref(true)

    // 历史查询条件
    const historyStart = ref(0)
    const historyEnd = ref(60)
    const historyStep = ref(5)

    /** 执行查询：将本地筛选同步到 store 并请求快照 */
    async function handleQuery() {
      store.setFilter({
        constellationId: localConstellationId.value,
        orbitLayer: localOrbitLayer.value,
        timeIndex: localTimeIndex.value,
        includeIsl: localIncludeIsl.value,
        includeGsl: localIncludeGsl.value
      })
      try {
        await store.fetchSnapshot()
      } catch (_) {
        // 错误由 store.state.error 展示
      }
    }

    /** 刷新全部数据（外部调用） */
    async function refreshData() {
      await store.loadConstellationOptions()
      await handleQuery()
    }

    // =====================================================================
    // 历史回放
    // =====================================================================

    /** 当前帧数据（computed-like，通过 ref 缓存） */
    const currentFrame = computed(() => {
      if (
        store.state.historyCurrentIndex < 0 ||
        store.state.historyCurrentIndex >= store.state.historyFrames.length
      ) return null
      return store.state.historyFrames[store.state.historyCurrentIndex]
    })

    /** 查询历史帧 */
    async function handleQueryHistory() {
      if (store.state.historyLoading) return
      try {
        await store.fetchHistory({
          startTimeIndex: historyStart.value,
          endTimeIndex: historyEnd.value,
          step: historyStep.value
        })
      } catch (_) {
        // 错误由 store.state.historyError 展示
      }
    }

    /** 跳到首帧 */
    function goToFirstFrame() {
      store.setHistoryFrame(0)
    }

    /** 上一帧 */
    function goToPrevFrame() {
      store.setHistoryFrame(store.state.historyCurrentIndex - 1)
    }

    /** 下一帧 */
    function goToNextFrame() {
      store.setHistoryFrame(store.state.historyCurrentIndex + 1)
    }

    /** 跳到末帧 */
    function goToLastFrame() {
      store.setHistoryFrame(store.state.historyFrames.length - 1)
    }

    /** 拖拽进度条 */
    function onFrameSlider(event) {
      store.setHistoryFrame(Number(event.target.value))
    }

    // 格式化工具
    function formatPosition(pos) {
      if (!pos) return '-'
      const x = (pos.x_km ?? 0).toFixed(0)
      const y = (pos.y_km ?? 0).toFixed(0)
      const z = (pos.z_km ?? 0).toFixed(0)
      return `${x}, ${y}, ${z}`
    }

    function formatVelocity(vel) {
      if (!vel) return '-'
      const vx = (vel.vx_km_s ?? 0).toFixed(2)
      const vy = (vel.vy_km_s ?? 0).toFixed(2)
      const vz = (vel.vz_km_s ?? 0).toFixed(2)
      return `${vx}, ${vy}, ${vz}`
    }

    function formatNumber(val) {
      if (val === null || val === undefined) return '-'
      if (typeof val === 'number') return val.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
      return val
    }

    // 初始化
    onMounted(async () => {
      await store.loadConstellationOptions()
      await handleQuery()
    })

    return {
      store,
      localConstellationId,
      localOrbitLayer,
      localTimeIndex,
      localIncludeIsl,
      localIncludeGsl,
      showNodes,
      showLinks,
      showHistory,
      historyStart,
      historyEnd,
      historyStep,
      currentFrame,
      handleQuery,
      handleQueryHistory,
      goToFirstFrame,
      goToPrevFrame,
      goToNextFrame,
      goToLastFrame,
      onFrameSlider,
      refreshData,
      formatPosition,
      formatVelocity,
      formatNumber
    }
  }
}
</script>

<style scoped>
/* ===================== 容器 ===================== */
.dtm-container {
  padding: 16px 20px;
  color: #e0e0e0;
  font-size: 14px;
  line-height: 1.6;
}

/* ===================== 标题 ===================== */
.dtm-header {
  margin-bottom: 16px;
}

.dtm-title {
  font-size: 18px;
  font-weight: 600;
  color: #38ffb7;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.title-icon {
  font-size: 20px;
}

/* ===================== 筛选栏 ===================== */
.dtm-filters {
  background: rgba(56, 255, 183, 0.03);
  border: 1px solid rgba(56, 255, 183, 0.12);
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 12px;
}

.filter-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
}

.filter-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.filter-label {
  font-size: 12px;
  color: rgba(255,255,255,0.5);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.filter-select,
.filter-input {
  background: rgba(0,0,0,0.4);
  border: 1px solid rgba(56, 255, 183, 0.2);
  border-radius: 4px;
  color: #e0e0e0;
  padding: 6px 10px;
  font-size: 13px;
  min-width: 100px;
  outline: none;
  transition: border-color 0.2s;
}

.filter-select:focus,
.filter-input:focus {
  border-color: #38ffb7;
}

.filter-select option {
  background: #010309;
  color: #e0e0e0;
}

.filter-input {
  width: 80px;
}

.filter-check {
  justify-content: flex-end;
}

.filter-checkbox {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 6px 0;
}

.filter-checkbox input[type="checkbox"] {
  accent-color: #38ffb7;
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.check-label {
  font-size: 13px;
  color: #e0e0e0;
  user-select: none;
}

.filter-action {
  margin-left: auto;
}

/* ===================== 时间信息 ===================== */
.time-info {
  margin-top: 8px;
  font-size: 12px;
  color: rgba(255,255,255,0.45);
  font-family: 'Courier New', monospace;
}

/* ===================== 按钮 ===================== */
.dtm-btn {
  padding: 6px 18px;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.dtm-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dtm-btn-primary {
  background: linear-gradient(135deg, #38ffb7, #2ddc9a);
  color: #010309;
  font-weight: 600;
}

.dtm-btn-primary:hover:not(:disabled) {
  box-shadow: 0 0 12px rgba(56, 255, 183, 0.35);
}

/* ===================== 错误提示 ===================== */
.dtm-error {
  background: rgba(255, 68, 68, 0.1);
  border: 1px solid rgba(255, 68, 68, 0.3);
  border-radius: 6px;
  padding: 10px 14px;
  margin-bottom: 12px;
  color: #ff6b6b;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.error-icon {
  font-size: 16px;
}

.error-dismiss {
  margin-left: auto;
  background: none;
  border: none;
  color: rgba(255, 68, 68, 0.6);
  cursor: pointer;
  font-size: 14px;
  padding: 2px 6px;
}

.error-dismiss:hover {
  color: #ff6b6b;
}

/* ===================== 加载中 ===================== */
.dtm-loading {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 32px;
  justify-content: center;
  color: rgba(255,255,255,0.6);
  font-size: 14px;
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(56, 255, 183, 0.2);
  border-top-color: #38ffb7;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ===================== 空数据 ===================== */
.dtm-empty {
  text-align: center;
  padding: 48px 20px;
  color: rgba(255,255,255,0.35);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
  opacity: 0.3;
}

.empty-hint {
  font-size: 12px;
  margin-top: 4px;
  color: rgba(255,255,255,0.2);
}

/* ===================== 快照汇总 ===================== */
.dtm-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 16px;
}

.summary-card {
  background: rgba(56, 255, 183, 0.04);
  border: 1px solid rgba(56, 255, 183, 0.12);
  border-radius: 6px;
  padding: 12px 18px;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 80px;
}

.summary-value {
  font-size: 22px;
  font-weight: 700;
  color: #38ffb7;
  line-height: 1.2;
}

.summary-label {
  font-size: 11px;
  color: rgba(255,255,255,0.5);
  margin-top: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.card-highlight {
  background: rgba(56, 255, 183, 0.08);
  border-color: rgba(56, 255, 183, 0.3);
}

.card-highlight .summary-value {
  color: #52c4ff;
}

/* ===================== 可折叠区域 ===================== */
.dtm-section {
  border: 1px solid rgba(56, 255, 183, 0.1);
  border-radius: 6px;
  margin-bottom: 10px;
  overflow: hidden;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: rgba(56, 255, 183, 0.03);
  cursor: pointer;
  user-select: none;
  transition: background 0.2s;
}

.section-header:hover {
  background: rgba(56, 255, 183, 0.06);
}

.section-toggle {
  font-size: 10px;
  color: rgba(255,255,255,0.4);
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #e0e0e0;
}

.section-body {
  padding: 0;
}

.section-empty {
  padding: 24px;
  text-align: center;
  color: rgba(255,255,255,0.3);
  font-size: 13px;
}

/* ===================== 表格 ===================== */
.dtm-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.dtm-table th {
  text-align: left;
  padding: 8px 10px;
  background: rgba(56, 255, 183, 0.04);
  color: rgba(255,255,255,0.5);
  font-weight: 500;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  border-bottom: 1px solid rgba(56, 255, 183, 0.08);
}

.dtm-table td {
  padding: 7px 10px;
  border-bottom: 1px solid rgba(56, 255, 183, 0.04);
  vertical-align: middle;
}

.dtm-table tbody tr:hover {
  background: rgba(56, 255, 183, 0.03);
}

.cell-id {
  font-family: 'Courier New', monospace;
  color: #52c4ff;
  font-size: 12px;
}

.cell-mono {
  font-family: 'Courier New', monospace;
  font-size: 11px;
  color: rgba(255,255,255,0.6);
}

.cell-num {
  font-family: 'Courier New', monospace;
  text-align: right;
  color: rgba(255,255,255,0.7);
}

.cell-count {
  text-align: center;
  font-weight: 600;
  color: #38ffb7;
}

.cell-source {
  font-size: 11px;
  color: rgba(255,255,255,0.45);
}

/* ===================== 类型标签 ===================== */
.type-tag {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 500;
}

.type-ground {
  background: rgba(82, 196, 255, 0.15);
  color: #52c4ff;
}

.type-satellite {
  background: rgba(56, 255, 183, 0.12);
  color: #38ffb7;
}

.link-type-tag {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 600;
}

.type-isl {
  background: rgba(255, 200, 50, 0.12);
  color: #ffc832;
}

.type-gsl {
  background: rgba(82, 196, 255, 0.12);
  color: #52c4ff;
}

/* ===================== 历史回放 ===================== */
.history-form {
  padding: 10px 14px;
  border-bottom: 1px solid rgba(56, 255, 183, 0.06);
}

.history-form-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
}

.history-error {
  margin: 8px 14px;
  padding: 8px 12px;
  background: rgba(255, 68, 68, 0.1);
  border: 1px solid rgba(255, 68, 68, 0.25);
  border-radius: 4px;
  color: #ff6b6b;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.history-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px;
  justify-content: center;
  color: rgba(255,255,255,0.5);
  font-size: 13px;
}

/* 帧导航 */
.frame-nav {
  padding: 10px 14px;
  border-bottom: 1px solid rgba(56, 255, 183, 0.06);
}

.frame-nav-row {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
}

.frame-btn {
  background: rgba(56, 255, 183, 0.08);
  border: 1px solid rgba(56, 255, 183, 0.15);
  border-radius: 4px;
  color: #e0e0e0;
  padding: 4px 10px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.frame-btn:hover:not(:disabled) {
  background: rgba(56, 255, 183, 0.15);
  border-color: #38ffb7;
}

.frame-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.frame-label {
  font-size: 13px;
  color: rgba(255,255,255,0.6);
  min-width: 100px;
  text-align: center;
}

.frame-label strong {
  color: #38ffb7;
  font-weight: 600;
}

/* 进度条 */
.frame-progress-wrap {
  margin-top: 8px;
  padding: 0 4px;
}

.frame-progress {
  width: 100%;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: rgba(56, 255, 183, 0.12);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}

.frame-progress::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #38ffb7;
  cursor: pointer;
  border: 2px solid #010309;
  box-shadow: 0 0 6px rgba(56, 255, 183, 0.4);
}

.frame-progress::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #38ffb7;
  cursor: pointer;
  border: 2px solid #010309;
}

/* 帧信息 */
.frame-info {
  padding: 8px 14px;
  background: rgba(56, 255, 183, 0.02);
  border-bottom: 1px solid rgba(56, 255, 183, 0.06);
}

.frame-info-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 4px;
}

.frame-info-item {
  font-size: 12px;
  color: rgba(255,255,255,0.5);
}

.frame-info-item strong {
  color: rgba(255,255,255,0.8);
  font-weight: 600;
}

/* 帧详情双列 */
.frame-detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
}

.frame-detail-col {
  overflow-x: auto;
}

.frame-detail-col:first-child {
  border-right: 1px solid rgba(56, 255, 183, 0.06);
}

.frame-detail-title {
  padding: 8px 14px;
  font-size: 12px;
  font-weight: 600;
  color: rgba(255,255,255,0.5);
  background: rgba(56, 255, 183, 0.02);
  border-bottom: 1px solid rgba(56, 255, 183, 0.06);
}

/* 次要按钮 */
.dtm-btn-secondary {
  background: rgba(82, 196, 255, 0.1);
  border: 1px solid rgba(82, 196, 255, 0.2);
  color: #52c4ff;
}

.dtm-btn-secondary:hover:not(:disabled) {
  background: rgba(82, 196, 255, 0.18);
  border-color: #52c4ff;
}
</style>
