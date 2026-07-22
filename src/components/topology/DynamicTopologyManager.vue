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

        <!-- 无星座提示 -->
        <div
          v-if="store.state.constellationOptions.length <= 1"
          class="no-constellation-hint"
        >
          请先在星座分组管理页面配置星座
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

        <!-- ========== 可见性规则 ========== -->
        <div class="dtm-section">
          <div
            class="section-header"
            @click="showRules = !showRules"
          >
            <span class="section-toggle">{{ showRules ? '▼' : '▶' }}</span>
            <span class="section-title">可见性规则</span>
            <span class="section-header-spacer"></span>
            <button
              class="dtm-btn dtm-btn-tiny"
              :disabled="store.state.rulesLoading"
              @click.stop="handleFetchRules"
            >
              {{ store.state.rulesLoading ? '加载中...' : '刷新规则' }}
            </button>
          </div>
          <div v-if="showRules" class="section-body">
            <!-- 规则加载中 -->
            <div
              v-if="store.state.rulesLoading"
              class="history-loading"
            >
              <div class="spinner"></div>
              <span>正在加载规则...</span>
            </div>

            <!-- 规则错误 -->
            <div
              v-if="store.state.rulesError"
              class="history-error"
            >
              <span class="error-icon">⚠</span>
              {{ store.state.rulesError }}
            </div>

            <!-- 保存错误 -->
            <div
              v-if="store.state.saveError"
              class="history-error"
            >
              <span class="error-icon">⚠</span>
              {{ store.state.saveError }}
              <button class="error-dismiss" @click="store.clearError()">✕</button>
            </div>

            <!-- 规则表单 -->
            <template v-if="store.state.rules">
              <div class="rules-form">
                <div class="rules-form-grid">
                  <div class="rules-field">
                    <label class="filter-label">ISL 最大距离</label>
                    <input
                      v-model.number="rulesForm.islMaxDistance"
                      type="number"
                      min="0"
                      class="filter-input rules-input"
                    />
                    <span class="rules-unit">km</span>
                  </div>
                  <div class="rules-field">
                    <label class="filter-label">单星最大邻居数</label>
                    <input
                      v-model.number="rulesForm.islMaxNeighbors"
                      type="number"
                      min="1"
                      class="filter-input rules-input"
                    />
                  </div>
                  <div class="rules-field rules-field-check">
                    <label class="filter-checkbox">
                      <input
                        v-model="rulesForm.sameOrbitLayerOnly"
                        type="checkbox"
                      />
                      <span class="check-label">仅同轨道层 (same_orbit_layer_only)</span>
                    </label>
                  </div>
                  <div class="rules-field rules-field-check">
                    <label class="filter-checkbox">
                      <input
                        v-model="rulesForm.sameConstellationOnly"
                        type="checkbox"
                      />
                      <span class="check-label">仅同星座 (same_constellation_only)</span>
                    </label>
                  </div>
                  <div class="rules-field">
                    <label class="filter-label">GSL 最大距离</label>
                    <input
                      v-model.number="rulesForm.gslMaxDistance"
                      type="number"
                      min="0"
                      class="filter-input rules-input"
                    />
                    <span class="rules-unit">km</span>
                  </div>
                  <div class="rules-field">
                    <label class="filter-label">单地面站最大链路数</label>
                    <input
                      v-model.number="rulesForm.gslMaxLinksPerGround"
                      type="number"
                      min="1"
                      class="filter-input rules-input"
                    />
                  </div>
                  <div class="rules-field">
                    <label class="filter-label">地球净空</label>
                    <input
                      v-model.number="rulesForm.earthClearance"
                      type="number"
                      min="0"
                      class="filter-input rules-input"
                    />
                    <span class="rules-unit">km</span>
                  </div>
                  <div class="rules-field">
                    <label class="filter-label">Ground001 最低仰角</label>
                    <input
                      v-model.number="rulesForm.minElevation"
                      type="number"
                      min="0"
                      max="90"
                      class="filter-input rules-input"
                    />
                    <span class="rules-unit">°</span>
                  </div>
                </div>
                <div class="rules-warning">
                  ⚠ PUT 规则会修改共享后端配置，需要项目负责人同意
                </div>
                <button
                  class="dtm-btn dtm-btn-danger"
                  :disabled="store.state.saving"
                  @click="openRulesConfirm"
                >
                  {{ store.state.saving ? '保存中...' : '保存规则' }}
                </button>
              </div>
            </template>

            <!-- 未加载规则 -->
            <div
              v-else-if="!store.state.rulesLoading && !store.state.rulesError"
              class="section-empty"
            >
              点击"刷新规则"加载当前可见性规则配置
            </div>
          </div>
        </div>
      </template>
    </template>
  </div>

  <!-- ========== 规则保存确认弹窗 ========== -->
  <Teleport to="body">
    <div
      v-if="showRulesConfirm"
      class="modal-overlay"
      data-function-panel-overlay
      @click.self="cancelRulesConfirm"
    >
      <div class="modal-dialog">
        <div class="modal-header">
          <span class="modal-icon">⚠</span>
          <span>确认修改规则</span>
        </div>
        <div class="modal-body">
          <p>确定要修改拓扑可见性规则吗？</p>
          <p class="modal-warning">此操作会修改共享后端配置，请确保已通知项目负责人。</p>
          <label class="modal-check">
            <input v-model="rulesNotified" type="checkbox" />
            <span>我已通知项目负责人</span>
          </label>
        </div>
        <div class="modal-footer">
          <button class="dtm-btn dtm-btn-outline" @click="cancelRulesConfirm">取消</button>
          <button
            class="dtm-btn dtm-btn-primary"
            :disabled="!rulesNotified || store.state.saving"
            @click="executeRulesSave"
          >
            {{ store.state.saving ? '保存中...' : '确认保存' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
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

    // =====================================================================
    // 可见性规则
    // =====================================================================
    const showRules = ref(false)

    /** 规则表单数据 */
    const rulesForm = reactive({
      islMaxDistance: 80000,
      islMaxNeighbors: 4,
      sameOrbitLayerOnly: false,
      sameConstellationOnly: false,
      gslMaxDistance: 50000,
      gslMaxLinksPerGround: 8,
      earthClearance: 50,
      minElevation: 5
    })

    /** 从 store 的 rules 填充表单 */
    function fillRulesForm() {
      const r = store.state.rules
      if (!r) return
      rulesForm.islMaxDistance = r.isl?.max_distance_km ?? 80000
      rulesForm.islMaxNeighbors = r.isl?.max_neighbors_per_satellite ?? 4
      rulesForm.sameOrbitLayerOnly = r.isl?.same_orbit_layer_only ?? false
      rulesForm.sameConstellationOnly = r.isl?.same_constellation_only ?? false
      rulesForm.gslMaxDistance = r.gsl?.max_distance_km ?? 50000
      rulesForm.gslMaxLinksPerGround = r.gsl?.max_links_per_ground ?? 8
      rulesForm.earthClearance = r.earth_clearance_km ?? 50
      rulesForm.minElevation = r.ground_stations?.Ground001?.min_elevation_deg ?? 5
    }

    // 确认弹窗状态
    const showRulesConfirm = ref(false)
    const rulesNotified = ref(false)

    /** 刷新规则 */
    async function handleFetchRules() {
      try {
        await store.fetchRules()
        fillRulesForm()
      } catch (_) {
        // 错误由 store.state.rulesError 展示
      }
    }

    /** 打开确认弹窗 */
    function openRulesConfirm() {
      rulesNotified.value = false
      showRulesConfirm.value = true
    }

    /** 取消确认 */
    function cancelRulesConfirm() {
      showRulesConfirm.value = false
      rulesNotified.value = false
    }

    /** 执行规则保存 */
    async function executeRulesSave() {
      try {
        await store.updateRules({
          earth_clearance_km: rulesForm.earthClearance,
          isl: {
            max_distance_km: rulesForm.islMaxDistance,
            max_neighbors_per_satellite: rulesForm.islMaxNeighbors,
            same_orbit_layer_only: rulesForm.sameOrbitLayerOnly,
            same_constellation_only: rulesForm.sameConstellationOnly
          },
          gsl: {
            max_distance_km: rulesForm.gslMaxDistance,
            max_links_per_ground: rulesForm.gslMaxLinksPerGround
          },
          ground_stations: {
            Ground001: {
              min_elevation_deg: rulesForm.minElevation
            }
          }
        })
        // 刷新成功后重新用后端归一化结果填充
        fillRulesForm()
        cancelRulesConfirm()
      } catch (_) {
        // 错误由 store.state.saveError 展示
      }
    }

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

    // 组件销毁时取消所有进行中的请求
    onBeforeUnmount(() => {
      store.cancelRequest()
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
      showRules,
      historyStart,
      historyEnd,
      historyStep,
      rulesForm,
      showRulesConfirm,
      rulesNotified,
      currentFrame,
      handleQuery,
      handleQueryHistory,
      handleFetchRules,
      openRulesConfirm,
      cancelRulesConfirm,
      executeRulesSave,
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

/* 无星座提示 */
.no-constellation-hint {
  font-size: 11px;
  color: #ffb84d;
  background: rgba(255, 184, 77, 0.06);
  border: 1px solid rgba(255, 184, 77, 0.12);
  border-radius: 3px;
  padding: 4px 10px;
  white-space: nowrap;
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

/* 小型按钮 */
.dtm-btn-tiny {
  padding: 2px 10px;
  font-size: 11px;
  background: rgba(56, 255, 183, 0.06);
  border: 1px solid rgba(56, 255, 183, 0.12);
  color: rgba(255,255,255,0.6);
  border-radius: 3px;
}

.dtm-btn-tiny:hover:not(:disabled) {
  background: rgba(56, 255, 183, 0.12);
  color: #38ffb7;
}

/* 危险按钮 */
.dtm-btn-danger {
  background: rgba(255, 68, 68, 0.1);
  border: 1px solid rgba(255, 68, 68, 0.25);
  color: #ff6b6b;
}

.dtm-btn-danger:hover:not(:disabled) {
  background: rgba(255, 68, 68, 0.18);
  border-color: #ff6b6b;
}

/* 描边按钮 */
.dtm-btn-outline {
  background: transparent;
  border: 1px solid rgba(56, 255, 183, 0.2);
  color: rgba(255,255,255,0.7);
}

.dtm-btn-outline:hover:not(:disabled) {
  border-color: #38ffb7;
  color: #38ffb7;
}

/* 标题栏 spacer */
.section-header-spacer {
  flex: 1;
}

/* ===================== 规则表单 ===================== */
.rules-form {
  padding: 14px;
}

.rules-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 16px;
}

.rules-field {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.rules-field .filter-label {
  width: 100%;
}

.rules-input {
  width: 100px !important;
}

.rules-unit {
  font-size: 11px;
  color: rgba(255,255,255,0.35);
}

.rules-field-check {
  align-items: center;
  padding-top: 16px;
}

.rules-field-check .filter-checkbox {
  padding: 0;
}

.rules-warning {
  margin-top: 12px;
  padding: 8px 12px;
  background: rgba(255, 184, 77, 0.08);
  border: 1px solid rgba(255, 184, 77, 0.2);
  border-radius: 4px;
  color: #ffb84d;
  font-size: 12px;
  line-height: 1.5;
}

/* ===================== 确认弹窗 ===================== */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.6);
  backdrop-filter: blur(4px);
}

.modal-dialog {
  width: 420px;
  max-width: calc(100vw - 40px);
  background: rgba(10, 20, 28, 0.96);
  border: 1px solid rgba(56, 255, 183, 0.2);
  border-radius: 8px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  background: rgba(56, 255, 183, 0.04);
  border-bottom: 1px solid rgba(56, 255, 183, 0.08);
  font-size: 15px;
  font-weight: 600;
  color: #e0e0e0;
}

.modal-icon {
  font-size: 20px;
}

.modal-body {
  padding: 18px;
  font-size: 14px;
  color: rgba(255,255,255,0.8);
  line-height: 1.6;
}

.modal-body p {
  margin-bottom: 8px;
}

.modal-warning {
  color: #ffb84d;
  font-size: 13px;
}

.modal-check {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  padding: 10px 12px;
  background: rgba(56, 255, 183, 0.03);
  border: 1px solid rgba(56, 255, 183, 0.1);
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}

.modal-check input[type="checkbox"] {
  accent-color: #38ffb7;
  width: 16px;
  height: 16px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 18px;
  border-top: 1px solid rgba(56, 255, 183, 0.06);
}
</style>
