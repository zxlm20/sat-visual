<template>
  <section class="link-state-manager" :class="{ compact }">
    <header class="manager-header">
      <div>
        <span class="eyebrow">3.7 链路状态</span>
        <h1>链路状态与拥塞监控</h1>
      </div>
      <div class="header-actions">
        <button
          type="button"
          class="secondary"
          :disabled="!loading"
          @click="cancelRequests"
        >
          取消请求
        </button>
        <button type="button" :disabled="state.loadingStatus" @click="refreshStatus">
          {{ state.loadingStatus ? '查询中...' : '刷新链路' }}
        </button>
      </div>
    </header>

    <div v-if="state.error" class="notice error" role="alert">
      <strong v-if="state.errorStatus">HTTP {{ state.errorStatus }}</strong>
      {{ state.error }}
    </div>

    <div v-if="state.cancelMessage" class="notice info" role="status">
      {{ state.cancelMessage }}
    </div>

    <div class="layout">
      <aside class="filter-panel">
        <div class="section-title">
          <strong>链路筛选</strong>
          <span>GET /api/links/status</span>
        </div>

        <div class="filter-grid">
          <label>
            <span>时间序号</span>
            <input
              type="number"
              step="0.1"
              :value="state.filters.timeIndex"
              @input="updateFilter('timeIndex', $event.target.value)"
            />
          </label>
          <label>
            <span>轨道层</span>
            <select
              :value="state.filters.orbitLayer"
              @change="updateFilter('orbitLayer', $event.target.value)"
            >
              <option value="">全部轨道层</option>
              <option value="LEO">LEO</option>
              <option value="MEO">MEO</option>
              <option value="HEO">HEO</option>
              <option value="GROUND">GROUND</option>
            </select>
          </label>
          <label>
            <span>业务星座 ID</span>
            <input
              type="text"
              placeholder="constellation-a"
              :value="state.filters.constellationId"
              @input="updateFilter('constellationId', $event.target.value)"
            />
          </label>
          <label>
            <span>节点 ID</span>
            <input
              type="text"
              placeholder="M001001"
              :value="state.filters.nodeId"
              @input="updateFilter('nodeId', $event.target.value)"
            />
          </label>
          <label>
            <span>链路类型</span>
            <select
              :value="state.filters.linkType"
              @change="updateFilter('linkType', $event.target.value)"
            >
              <option value="">全部类型</option>
              <option value="isl">isl</option>
              <option value="gsl">gsl</option>
              <option value="task_stream">task_stream</option>
              <option value="physical_access">physical_access</option>
            </select>
          </label>
          <label>
            <span>状态</span>
            <select
              :value="state.filters.status"
              @change="updateFilter('status', $event.target.value)"
            >
              <option value="">全部状态</option>
              <option value="up">up</option>
              <option value="down">down</option>
            </select>
          </label>
        </div>

        <div class="switch-list">
          <label>
            <input
              type="checkbox"
              :checked="state.filters.includeDynamicLinks"
              @change="updateFilter('includeDynamicLinks', $event.target.checked)"
            />
            包含动态几何链路 isl/gsl
          </label>
          <label>
            <input
              type="checkbox"
              :checked="state.filters.includeOperationalLinks"
              @change="updateFilter('includeOperationalLinks', $event.target.checked)"
            />
            包含运行链路 task_stream/physical_access
          </label>
        </div>

        <div class="filter-actions">
          <button type="button" class="secondary" @click="resetAndRefresh">
            重置
          </button>
          <button type="button" :disabled="state.loadingStatus" @click="refreshStatus">
            {{ state.loadingStatus ? '查询中...' : '查询链路' }}
          </button>
        </div>
      </aside>

      <main class="content-panel">
        <section class="summary-grid">
          <article class="summary-card">
            <span>链路总数</span>
            <strong>{{ summary?.link_count ?? links.length }}</strong>
          </article>
          <article class="summary-card">
            <span>业务流数量</span>
            <strong>{{ summary?.business_flow_count ?? state.businessFlowsInSnapshot.length }}</strong>
          </article>
          <article class="summary-card">
            <span>阈值版本</span>
            <strong>{{ snapshot?.thresholds_version ?? '-' }}</strong>
          </article>
          <article class="summary-card">
            <span>更新时间</span>
            <strong>{{ formatTime(state.updateTime) }}</strong>
          </article>
        </section>

        <section class="detail-panel">
          <div class="section-title">
            <strong>类型与拥塞汇总</strong>
            <span>颜色使用后端 color_level</span>
          </div>
          <div class="metric-groups">
            <div>
              <strong>链路类型</strong>
              <span v-for="item in mapEntries(summary?.by_type)" :key="`type-${item.key}`">
                {{ formatLinkType(item.key) }} <b>{{ item.value }}</b>
              </span>
            </div>
            <div>
              <strong>状态</strong>
              <span v-for="item in mapEntries(summary?.by_status)" :key="`status-${item.key}`">
                {{ item.key }} <b>{{ item.value }}</b>
              </span>
            </div>
            <div>
              <strong>六档拥塞</strong>
              <span v-for="item in congestionEntries" :key="`congestion-${item.key}`">
                <i :style="{ background: getCongestionColor(item.key) }"></i>
                {{ formatCongestion(item.key) }} <b>{{ item.value }}</b>
              </span>
            </div>
          </div>
        </section>

        <section class="detail-panel threshold-panel">
          <div class="section-title">
            <strong>六档拥塞阈值</strong>
            <span>GET /api/links/thresholds · PUT /api/links/thresholds</span>
          </div>

          <div v-if="state.thresholdsError" class="notice warning" role="alert">
            {{ state.thresholdsError }}
          </div>

          <div v-if="state.actionMessage" class="notice success" role="status">
            {{ state.actionMessage }}
          </div>

          <div class="threshold-toolbar">
            <span>
              当前版本
              <strong>{{ thresholds?.version ?? thresholds?.thresholds_version ?? '-' }}</strong>
            </span>
            <div>
              <button
                type="button"
                class="secondary"
                :disabled="state.loadingThresholds || state.savingThresholds"
                @click="refreshThresholds"
              >
                {{ state.loadingThresholds ? '读取中...' : '读取阈值' }}
              </button>
              <button
                type="button"
                :disabled="state.loadingThresholds || state.savingThresholds || !thresholds"
                @click="saveThresholdDraft"
              >
                {{ state.savingThresholds ? '保存中...' : '保存阈值' }}
              </button>
            </div>
          </div>

          <div v-if="thresholds" class="threshold-content">
            <div class="threshold-groups">
              <div
                v-for="group in thresholdGroups"
                :key="group.key"
                class="threshold-group"
              >
                <strong>{{ group.label }}</strong>
                <label
                  v-for="item in group.items"
                  :key="`${group.key}-${item.key}`"
                >
                  <span>{{ item.label }}</span>
                  <input
                    type="number"
                    step="0.01"
                    :value="getThresholdValue(group.key, item.key)"
                    @input="updateThresholdValue(group.key, item.key, $event.target.value)"
                  />
                </label>
              </div>

              <div class="threshold-group">
                <strong>估算 tile 大小</strong>
                <label>
                  <span>estimated_tile_bytes</span>
                  <input
                    type="number"
                    step="1"
                    :value="state.thresholdDraft.estimated_tile_bytes"
                    @input="updateThresholdRootValue('estimated_tile_bytes', $event.target.value)"
                  />
                </label>
              </div>
            </div>

            <div class="congestion-levels">
              <strong>六档利用率区间</strong>
              <div class="level-strip">
                <span
                  v-for="level in congestionLevels"
                  :key="level.key"
                  :style="{ '--level-color': getCongestionColor(level.key) }"
                >
                  <i></i>
                  {{ formatCongestion(level.key) }}
                  <b>{{ level.range }}</b>
                </span>
              </div>
            </div>

            <details class="threshold-json">
              <summary>查看待提交 JSON</summary>
              <pre>{{ formatJson(state.thresholdDraft) }}</pre>
            </details>
          </div>

          <div v-else-if="state.loadingThresholds" class="empty-box">
            正在读取阈值配置...
          </div>

          <div v-else class="empty-box">
            点击“读取阈值”后编辑链路容量、处理时延和基础丢包配置
          </div>
        </section>

        <section class="detail-panel history-panel">
          <div class="section-title">
            <strong>链路历史回放</strong>
            <span>GET /api/links/history</span>
          </div>

          <div v-if="state.historyError" class="notice warning" role="alert">
            {{ state.historyError }}
          </div>

          <div class="history-query">
            <label>
              <span>开始时刻</span>
              <input
                type="number"
                step="0.1"
                :value="state.historyFilters.startTimeIndex"
                @input="updateHistoryFilter('startTimeIndex', $event.target.value)"
              />
            </label>
            <label>
              <span>结束时刻</span>
              <input
                type="number"
                step="0.1"
                :value="state.historyFilters.endTimeIndex"
                @input="updateHistoryFilter('endTimeIndex', $event.target.value)"
              />
            </label>
            <label>
              <span>步长</span>
              <input
                type="number"
                min="0.000001"
                step="0.1"
                :value="state.historyFilters.step"
                @input="updateHistoryFilter('step', $event.target.value)"
              />
            </label>
            <label>
              <span>节点 ID</span>
              <input
                type="text"
                placeholder="M001001"
                :value="state.historyFilters.nodeId"
                @input="updateHistoryFilter('nodeId', $event.target.value)"
              />
            </label>
            <label>
              <span>链路类型</span>
              <select
                :value="state.historyFilters.linkType"
                @change="updateHistoryFilter('linkType', $event.target.value)"
              >
                <option value="">全部动态链路</option>
                <option value="isl">isl</option>
                <option value="gsl">gsl</option>
              </select>
            </label>
          </div>

          <div class="history-toolbar">
            <span>
              预计
              <strong :class="{ danger: estimatedHistoryFrameCount > 120 }">
                {{ estimatedHistoryFrameCount }}
              </strong>
              帧，后端限制 max_history_frames=120
            </span>
            <div>
              <button type="button" class="secondary" @click="resetHistoryAndQuery">
                重置
              </button>
              <button
                type="button"
                :disabled="state.loadingHistory || estimatedHistoryFrameCount > 120"
                @click="queryHistory"
              >
                {{ state.loadingHistory ? '查询中...' : '查询历史' }}
              </button>
            </div>
          </div>

          <div v-if="historyFrames.length" class="history-content">
            <div class="history-overview">
              <article>
                <span>返回帧数</span>
                <strong>{{ historyFrames.length }}</strong>
              </article>
              <article>
                <span>当前帧</span>
                <strong>{{ state.selectedHistoryFrameIndex + 1 }}</strong>
              </article>
              <article>
                <span>time_index</span>
                <strong>{{ getFrameTimeIndex(selectedHistoryFrame) }}</strong>
              </article>
              <article>
                <span>链路数</span>
                <strong>{{ selectedHistoryLinks.length }}</strong>
              </article>
            </div>

            <div class="frame-picker">
              <input
                type="range"
                min="0"
                :max="historyFrames.length - 1"
                :value="state.selectedHistoryFrameIndex"
                @input="selectHistoryFrame($event.target.value)"
              />
              <div class="frame-ticks">
                <button
                  v-for="(frame, index) in historyFramePreview"
                  :key="`history-frame-${index}`"
                  type="button"
                  class="secondary"
                  :class="{ active: index === state.selectedHistoryFrameIndex }"
                  @click="selectHistoryFrame(index)"
                >
                  {{ getFrameTimeIndex(frame) }}
                </button>
              </div>
            </div>

            <div class="link-table history-table">
              <div class="link-row head">
                <span>链路</span>
                <span>类型/状态</span>
                <span>距离/时延</span>
                <span>容量</span>
                <span>利用率</span>
                <span>拥塞</span>
              </div>
              <div
                v-for="link in selectedHistoryLinks"
                :key="link.id"
                class="link-row history-link-row"
                :style="{ '--level-color': getColorLevel(link.color_level) }"
              >
                <span>
                  <strong>{{ link.source || '-' }} → {{ link.target || '-' }}</strong>
                  <small>{{ link.id || '-' }}</small>
                </span>
                <span>
                  <strong>{{ formatLinkType(link.link_type) }}</strong>
                  <small>{{ link.status || '-' }}</small>
                </span>
                <span>
                  <strong>{{ formatKm(link.distance_km) }}</strong>
                  <small>{{ formatMs(link.propagation_delay_ms ?? link.latency_ms) }}</small>
                </span>
                <span>
                  <strong>{{ formatMbps(link.capacity_mbps) }}</strong>
                  <small>{{ link.threshold_source || '-' }}</small>
                </span>
                <span>
                  <strong>{{ formatPercent(link.bandwidth_utilization_percent) }}</strong>
                  <small>{{ formatPercent(link.loss_percent) }}</small>
                </span>
                <span class="congestion-cell">
                  <i></i>
                  <strong>{{ link.congestion_label || formatCongestion(link.congestion_level) }}</strong>
                  <small>level {{ link.color_level ?? 0 }}</small>
                </span>
              </div>
            </div>

            <div v-if="selectedHistoryLinks.length === 0" class="empty-box">
              当前历史帧没有可见链路
            </div>
          </div>

          <div v-else-if="state.loadingHistory" class="empty-box">
            正在读取链路历史...
          </div>

          <div v-else class="empty-box">
            输入时间范围后查询历史，可用滑块切换每一帧的动态链路状态
          </div>
        </section>

        <section class="detail-panel business-flow-panel">
          <div class="section-title">
            <strong>当前推理业务流</strong>
            <span>GET /api/links/business-flows</span>
          </div>

          <div v-if="state.businessFlowError" class="notice warning" role="alert">
            {{ state.businessFlowError }}
          </div>

          <div class="business-toolbar">
            <span>
              数据来源
              <strong>{{ businessFlowSource || '-' }}</strong>
            </span>
            <button
              type="button"
              :disabled="state.loadingBusinessFlows"
              @click="queryBusinessFlows"
            >
              {{ state.loadingBusinessFlows ? '读取中...' : '刷新业务流' }}
            </button>
          </div>

          <div v-if="businessFlows.length" class="business-content">
            <div class="business-overview">
              <article>
                <span>业务流数量</span>
                <strong>{{ businessFlows.length }}</strong>
              </article>
              <article>
                <span>tile 总数</span>
                <strong>{{ businessFlowSummary.tileCount }}</strong>
              </article>
              <article>
                <span>流量总量</span>
                <strong>{{ formatBytes(businessFlowSummary.trafficBytes) }}</strong>
              </article>
              <article>
                <span>当前速率</span>
                <strong>{{ formatMbps(businessFlowSummary.currentRateMbps) }}</strong>
              </article>
            </div>

            <div class="business-flow-list">
              <article
                v-for="flow in businessFlows"
                :key="flow.flow_id || flow.job_id"
                class="business-flow-card"
              >
                <div class="flow-card-head">
                  <div>
                    <strong>{{ flow.flow_id || '-' }}</strong>
                    <span>{{ flow.job_id || '-' }}</span>
                  </div>
                  <b>{{ flow.status || '-' }}</b>
                </div>

                <div class="flow-fields">
                  <span>
                    类型
                    <strong>{{ flow.business_type || '-' }}</strong>
                  </span>
                  <span>
                    目的物理节点
                    <strong>{{ flow.physical_destination || '-' }}</strong>
                  </span>
                  <span>
                    tile
                    <strong>{{ flow.tile_count ?? '-' }}</strong>
                  </span>
                  <span>
                    流量
                    <strong>{{ formatBytes(flow.traffic_bytes) }}</strong>
                  </span>
                  <span>
                    速率
                    <strong>{{ formatMbps(flow.current_rate_mbps) }}</strong>
                  </span>
                  <span>
                    分配代价
                    <strong>{{ formatNumber(flow.assigned_cost) }}</strong>
                  </span>
                </div>

                <div class="flow-path">
                  <strong>节点路径</strong>
                  <div>
                    <span
                      v-for="node in normalizeList(flow.path_nodes)"
                      :key="`${flow.flow_id || flow.job_id}-node-${node}`"
                    >
                      {{ node }}
                    </span>
                  </div>
                </div>

                <div class="flow-path link-path">
                  <strong>链路 ID</strong>
                  <div>
                    <span
                      v-for="linkId in normalizeList(flow.path_link_ids)"
                      :key="`${flow.flow_id || flow.job_id}-link-${linkId}`"
                    >
                      {{ linkId }}
                    </span>
                  </div>
                </div>

                <details class="flow-json">
                  <summary>查看业务流 JSON</summary>
                  <pre>{{ formatJson(flow) }}</pre>
                </details>
              </article>
            </div>
          </div>

          <div v-else-if="state.loadingBusinessFlows" class="empty-box">
            正在读取最新推理业务流...
          </div>

          <div v-else class="empty-box">
            当前没有最近推理业务流，或后端暂未返回 dispatcher 最新任务
          </div>
        </section>

        <section class="detail-panel link-list-panel">
          <div class="section-title">
            <strong>链路列表</strong>
            <span>{{ links.length }} 条</span>
          </div>

          <div class="link-table">
            <div class="link-row head">
              <span>链路</span>
              <span>类型/状态</span>
              <span>容量/速率</span>
              <span>利用率/时延</span>
              <span>丢包/业务</span>
              <span>拥塞</span>
            </div>
            <button
              v-for="link in links"
              :key="link.id"
              type="button"
              class="link-row"
              :class="{ active: state.selectedLinkId === link.id }"
              :style="{ '--level-color': getColorLevel(link.color_level) }"
              @click="openLinkDetail(link)"
            >
              <span>
                <strong>{{ link.source || '-' }} → {{ link.target || '-' }}</strong>
                <small>{{ link.id || '-' }}</small>
              </span>
              <span>
                <strong>{{ formatLinkType(link.link_type) }}</strong>
                <small>{{ link.status || '-' }}</small>
              </span>
              <span>
                <strong>{{ formatMbps(link.capacity_mbps) }}</strong>
                <small>{{ formatMbps(link.current_transfer_rate_mbps ?? link.transmission_rate_mbps) }}</small>
              </span>
              <span>
                <strong>{{ formatPercent(link.bandwidth_utilization_percent) }}</strong>
                <small>{{ formatMs(link.latency_ms) }}</small>
              </span>
              <span>
                <strong>{{ formatPercent(link.loss_percent) }}</strong>
                <small>{{ link.business_type || formatBusinessTypes(link.business_types) || '-' }}</small>
              </span>
              <span class="congestion-cell">
                <i></i>
                <strong>{{ link.congestion_label || link.traffic_label || formatCongestion(link.congestion_level) }}</strong>
                <small>level {{ link.color_level ?? 0 }}</small>
              </span>
            </button>
          </div>

          <div v-if="!state.loadingStatus && links.length === 0" class="empty-box">
            当前筛选条件下暂无链路
          </div>
        </section>

        <section class="detail-panel detail-view">
          <div class="section-title">
            <strong>单链路详情</strong>
            <span>{{ state.selectedLinkId || '未选择' }}</span>
          </div>

          <div v-if="state.detailError" class="notice warning">
            <strong v-if="state.detailErrorStatus">HTTP {{ state.detailErrorStatus }}</strong>
            {{ state.detailError }}
          </div>

          <div v-if="selectedLink" class="detail-grid">
            <dl>
              <div>
                <dt>source</dt>
                <dd>{{ selectedLink.source || '-' }}</dd>
              </div>
              <div>
                <dt>target</dt>
                <dd>{{ selectedLink.target || '-' }}</dd>
              </div>
              <div>
                <dt>link_type</dt>
                <dd>{{ formatLinkType(selectedLink.link_type) }}</dd>
              </div>
              <div>
                <dt>status</dt>
                <dd>{{ selectedLink.status || '-' }}</dd>
              </div>
              <div>
                <dt>distance_km</dt>
                <dd>{{ formatKm(selectedLink.distance_km) }}</dd>
              </div>
              <div>
                <dt>propagation_delay_ms</dt>
                <dd>{{ formatMs(selectedLink.propagation_delay_ms) }}</dd>
              </div>
              <div>
                <dt>measurement_source</dt>
                <dd>{{ selectedLink.measurement_source || '-' }}</dd>
              </div>
              <div>
                <dt>calculation_source</dt>
                <dd>{{ selectedLink.calculation_source || '-' }}</dd>
              </div>
              <div>
                <dt>threshold_source</dt>
                <dd>{{ selectedLink.threshold_source || '-' }}</dd>
              </div>
            </dl>

            <pre>{{ formatJson(selectedLink) }}</pre>
          </div>

          <div v-else-if="state.loadingDetail" class="empty-box">
            正在读取链路详情...
          </div>

          <div v-else class="empty-box">
            点击上方链路列表中的一条链路查看详情
          </div>
        </section>
      </main>
    </div>
  </section>
</template>

<script>
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useLinkStateStore } from '@/store/linkStateStore'

const COLOR_LEVELS = ['#94a3b8', '#38ffb7', '#52c4ff', '#ffd86b', '#ff9f43', '#ff4d6d']
const CONGESTION_LABELS = {
  idle: '空闲',
  smooth: '平滑',
  normal: '正常',
  light: '轻度拥塞',
  medium: '中度拥塞',
  heavy: '重度拥塞'
}

export default {
  name: 'LinkStateManager',
  props: {
    compact: {
      type: Boolean,
      default: false
    }
  },
  setup() {
    const {
      state,
      links,
      summary,
      snapshot,
      selectedLink,
      thresholds,
      historyFrames,
      selectedHistoryFrame,
      businessFlows,
      businessFlowSource,
      loading,
      updateFilters,
      resetFilters,
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
      cancelAllRequests,
      stopAllRequests
    } = useLinkStateStore()

    const thresholdGroups = [
      {
        key: 'capacities_mbps',
        label: '链路容量 Mbps',
        items: [
          { key: 'isl', label: 'isl' },
          { key: 'gsl', label: 'gsl' },
          { key: 'task_stream', label: 'task_stream' },
          { key: 'physical_access', label: 'physical_access' }
        ]
      },
      {
        key: 'processing_delay_ms',
        label: '处理时延 ms',
        items: [
          { key: 'isl', label: 'isl' },
          { key: 'gsl', label: 'gsl' },
          { key: 'task_stream', label: 'task_stream' },
          { key: 'physical_access', label: 'physical_access' }
        ]
      },
      {
        key: 'base_loss_percent',
        label: '基础丢包率 %',
        items: [
          { key: 'isl', label: 'isl' },
          { key: 'gsl', label: 'gsl' },
          { key: 'task_stream', label: 'task_stream' },
          { key: 'physical_access', label: 'physical_access' }
        ]
      }
    ]

    const congestionEntries = computed(() => {
      const source = summary.value?.by_congestion || {}
      const orderedKeys = ['idle', 'smooth', 'normal', 'light', 'medium', 'heavy']
      return orderedKeys
        .filter((key) => Object.prototype.hasOwnProperty.call(source, key))
        .map((key) => ({ key, value: source[key] }))
    })

    const congestionLevels = computed(() => {
      const configured = state.thresholdDraft.congestion_levels
      const orderedKeys = ['idle', 'smooth', 'normal', 'light', 'medium', 'heavy']
      const defaults = {
        idle: '0-10%',
        smooth: '10-30%',
        normal: '30-55%',
        light: '55-70%',
        medium: '70-85%',
        heavy: '>=85%'
      }

      if (Array.isArray(configured)) {
        return configured.map((item) => ({
          key: item.level || item.name || item.key,
          range: formatRange(item)
        }))
      }

      if (configured && typeof configured === 'object') {
        return orderedKeys.map((key) => ({
          key,
          range: formatRange(configured[key], defaults[key])
        }))
      }

      return orderedKeys.map((key) => ({
        key,
        range: defaults[key]
      }))
    })

    const estimatedHistoryFrameCount = computed(() => getHistoryFrameCount())

    const selectedHistoryLinks = computed(() => {
      const frame = selectedHistoryFrame.value || {}
      return frame.links || frame.visible_links || frame.link_states || []
    })

    const historyFramePreview = computed(() => (
      historyFrames.value.length <= 24
        ? historyFrames.value
        : historyFrames.value.slice(0, 24)
    ))

    const businessFlowSummary = computed(() => (
      businessFlows.value.reduce((summaryValue, flow) => ({
        tileCount: summaryValue.tileCount + (Number(flow.tile_count) || 0),
        trafficBytes: summaryValue.trafficBytes + (Number(flow.traffic_bytes) || 0),
        currentRateMbps: summaryValue.currentRateMbps + (Number(flow.current_rate_mbps) || 0)
      }), {
        tileCount: 0,
        trafficBytes: 0,
        currentRateMbps: 0
      })
    ))

    const refreshStatus = async () => {
      try {
        await fetchStatus()
      } catch (_) {
        // Store 已写入错误信息，避免重复提示。
      }
    }

    const refreshThresholds = async () => {
      try {
        await fetchThresholds()
      } catch (_) {
        // Store 已写入错误信息，避免重复提示。
      }
    }

    const saveThresholdDraft = async () => {
      try {
        await saveThresholds(state.thresholdDraft)
        await refreshStatus()
      } catch (_) {
        // Store 已写入错误信息，避免重复提示。
      }
    }

    const queryHistory = async () => {
      try {
        await fetchHistory()
      } catch (_) {
        // Store 已写入错误信息，避免重复提示。
      }
    }

    const queryBusinessFlows = async () => {
      try {
        await fetchBusinessFlows()
      } catch (_) {
        // Store 已写入错误信息，避免重复提示。
      }
    }

    const cancelRequests = () => {
      cancelAllRequests()
    }

    const resetHistoryAndQuery = async () => {
      resetHistoryFilters()
      await queryHistory()
    }

    const resetAndRefresh = async () => {
      resetFilters()
      await refreshStatus()
    }

    const updateFilter = (name, value) => {
      updateFilters({ [name]: value })
    }

    const updateHistoryFilter = (name, value) => {
      updateHistoryFilters({ [name]: value })
    }

    const normalizeDraftNumber = (value) => {
      const numberValue = Number(value)
      return Number.isFinite(numberValue) ? numberValue : 0
    }

    const updateThresholdValue = (groupKey, itemKey, value) => {
      if (!state.thresholdDraft[groupKey]) {
        state.thresholdDraft[groupKey] = {}
      }
      state.thresholdDraft[groupKey][itemKey] = normalizeDraftNumber(value)
    }

    const updateThresholdRootValue = (key, value) => {
      state.thresholdDraft[key] = normalizeDraftNumber(value)
    }

    const getThresholdValue = (groupKey, itemKey) => (
      state.thresholdDraft[groupKey]?.[itemKey] ?? ''
    )

    const openLinkDetail = async (link) => {
      if (!link?.id) return
      try {
        await fetchLinkDetail(link.id)
      } catch (_) {
        // Store 已写入错误信息，避免重复提示。
      }
    }

    const mapEntries = (value) => (
      Object.entries(value || {}).map(([key, itemValue]) => ({
        key,
        value: itemValue
      }))
    )

    const getColorLevel = (level) => {
      const index = Math.max(0, Math.min(COLOR_LEVELS.length - 1, Number(level) || 0))
      return COLOR_LEVELS[index]
    }

    const getCongestionColor = (level) => {
      const indexMap = {
        idle: 0,
        smooth: 1,
        normal: 2,
        light: 3,
        medium: 4,
        heavy: 5
      }
      return getColorLevel(indexMap[level] ?? 0)
    }

    const formatNumber = (value, digits = 2) => {
      const numberValue = Number(value)
      if (!Number.isFinite(numberValue)) return '-'
      return numberValue.toFixed(digits)
    }

    const formatMbps = (value) => `${formatNumber(value)} Mbps`
    const formatMs = (value) => `${formatNumber(value)} ms`
    const formatKm = (value) => `${formatNumber(value)} km`
    const formatPercent = (value) => `${formatNumber(value)}%`

    const formatBytes = (value) => {
      const numberValue = Number(value)
      if (!Number.isFinite(numberValue)) return '-'
      if (numberValue >= 1024 * 1024) return `${formatNumber(numberValue / 1024 / 1024)} MiB`
      if (numberValue >= 1024) return `${formatNumber(numberValue / 1024)} KiB`
      return `${numberValue.toFixed(0)} B`
    }

    const formatLinkType = (value) => {
      const labels = {
        isl: '动态几何链路 ISL',
        gsl: '动态几何链路 GSL',
        task_stream: '任务流',
        physical_access: '物理接入'
      }
      return labels[value] || value || '-'
    }

    const formatCongestion = (value) => CONGESTION_LABELS[value] || value || '-'
    const formatBusinessTypes = (value) => Array.isArray(value) ? value.join('、') : ''

    const formatRange = (value, fallback = '-') => {
      if (!value) return fallback
      if (typeof value === 'string') return value
      if (typeof value !== 'object') return String(value)

      const min = value.min_percent ?? value.min ?? value.from
      const max = value.max_percent ?? value.max ?? value.to
      if (min !== undefined && max !== undefined) return `${min}-${max}%`
      if (min !== undefined) return `>=${min}%`
      if (max !== undefined) return `<${max}%`
      return fallback
    }

    const formatTime = (value) => {
      if (!value) return '-'
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return String(value)
      return date.toLocaleString()
    }

    const getFrameTimeIndex = (frame) => (
      frame?.time_index ?? frame?.timeIndex ?? frame?.time ?? '-'
    )

    const normalizeList = (value) => (
      Array.isArray(value) ? value.filter(Boolean) : []
    )

    const formatJson = (value) => JSON.stringify(value || {}, null, 2)

    onMounted(() => {
      refreshStatus().then(() => {
        if (state.selectedLinkId) openLinkDetail({ id: state.selectedLinkId })
      })
      refreshThresholds()
      queryBusinessFlows()
    })
    onBeforeUnmount(stopAllRequests)

    return {
      state,
      links,
      summary,
      snapshot,
      selectedLink,
      thresholds,
      historyFrames,
      selectedHistoryFrame,
      businessFlows,
      businessFlowSource,
      loading,
      thresholdGroups,
      congestionEntries,
      congestionLevels,
      estimatedHistoryFrameCount,
      selectedHistoryLinks,
      historyFramePreview,
      businessFlowSummary,
      refreshStatus,
      refreshThresholds,
      saveThresholdDraft,
      queryHistory,
      queryBusinessFlows,
      cancelRequests,
      resetHistoryAndQuery,
      resetAndRefresh,
      updateFilter,
      updateHistoryFilter,
      selectHistoryFrame,
      updateThresholdValue,
      updateThresholdRootValue,
      getThresholdValue,
      openLinkDetail,
      mapEntries,
      getColorLevel,
      getCongestionColor,
      formatNumber,
      formatMbps,
      formatMs,
      formatKm,
      formatPercent,
      formatBytes,
      formatLinkType,
      formatCongestion,
      formatBusinessTypes,
      formatTime,
      getFrameTimeIndex,
      normalizeList,
      formatJson
    }
  }
}
</script>

<style scoped>
.link-state-manager {
  box-sizing: border-box;
  height: 100vh;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 22px;
  color: #eaffff;
  background:
    radial-gradient(circle at 22% 18%, rgba(82, 196, 255, .12), transparent 24%),
    radial-gradient(circle at 76% 32%, rgba(56, 255, 183, .1), transparent 24%),
    linear-gradient(135deg, #010309, #03131d 52%, #01050a);
  scrollbar-color: rgba(82, 196, 255, .48) rgba(1, 10, 17, .72);
  scrollbar-width: thin;
}

.link-state-manager.compact {
  height: 100%;
  min-height: 0;
  padding: 14px;
  background: transparent;
}

.link-state-manager.compact .manager-header h1 {
  font-size: 20px;
}

.manager-header,
.section-title,
.filter-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.manager-header {
  margin-bottom: 14px;
}

.header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.eyebrow {
  color: #38ffb7;
  font-size: 12px;
}

h1 {
  margin: 5px 0 0;
  color: #fff;
  font-size: 24px;
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

.notice strong {
  margin-right: 8px;
}

.notice.error {
  color: #ffd86b;
  background: rgba(255, 216, 107, .08);
  border: 1px solid rgba(255, 216, 107, .32);
}

.notice.warning {
  margin: 0 0 10px;
  color: #ffe39a;
  background: rgba(255, 184, 77, .08);
  border: 1px solid rgba(255, 184, 77, .34);
}

.notice.success {
  margin: 0 0 10px;
  color: #b9ffe7;
  background: rgba(56, 255, 183, .08);
  border: 1px solid rgba(56, 255, 183, .26);
}

.notice.info {
  color: #bdefff;
  background: rgba(82, 196, 255, .08);
  border: 1px solid rgba(82, 196, 255, .26);
}

.layout {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 14px;
}

.filter-panel,
.detail-panel {
  background: rgba(4, 24, 32, .82);
  border: 1px solid rgba(82, 196, 255, .24);
  border-radius: 8px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, .28);
}

.filter-panel {
  align-self: start;
  display: grid;
  gap: 12px;
  padding: 13px;
}

.content-panel {
  display: grid;
  gap: 12px;
  min-width: 0;
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

.filter-grid {
  display: grid;
  gap: 10px;
}

.filter-grid label span {
  display: block;
  margin-bottom: 5px;
  color: rgba(201, 255, 247, .58);
  font-size: 11px;
}

input,
select {
  box-sizing: border-box;
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

.switch-list {
  display: grid;
  gap: 8px;
  color: rgba(226, 255, 251, .76);
  font-size: 12px;
}

.switch-list label {
  display: flex;
  align-items: center;
  gap: 8px;
}

.switch-list input {
  width: 16px;
  height: 16px;
  accent-color: #38ffb7;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.summary-card,
.detail-panel {
  padding: 13px;
}

.summary-card {
  background: rgba(4, 24, 32, .82);
  border: 1px solid rgba(82, 196, 255, .24);
  border-radius: 8px;
}

.summary-card span,
.summary-card strong {
  display: block;
}

.summary-card span {
  color: rgba(201, 255, 247, .54);
  font-size: 11px;
}

.summary-card strong {
  margin-top: 6px;
  overflow: hidden;
  color: #fff;
  font-size: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.metric-groups {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 10px;
}

.metric-groups > div {
  display: grid;
  gap: 7px;
  padding: 10px;
  background: rgba(2, 18, 28, .62);
  border: 1px solid rgba(82, 196, 255, .18);
  border-radius: 7px;
}

.metric-groups strong {
  color: #38ffb7;
  font-size: 12px;
}

.metric-groups span {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: rgba(226, 255, 251, .76);
  font-size: 12px;
}

.metric-groups i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  box-shadow: 0 0 10px currentColor;
}

.threshold-panel {
  display: grid;
  gap: 10px;
}

.threshold-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px;
  color: rgba(226, 255, 251, .7);
  background: rgba(2, 18, 28, .62);
  border: 1px solid rgba(82, 196, 255, .18);
  border-radius: 7px;
  font-size: 12px;
}

.threshold-toolbar strong {
  margin-left: 4px;
  color: #fff;
}

.threshold-toolbar > div {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.threshold-content {
  display: grid;
  gap: 10px;
}

.threshold-groups {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.threshold-group {
  display: grid;
  gap: 8px;
  min-width: 0;
  padding: 10px;
  background: rgba(2, 18, 28, .62);
  border: 1px solid rgba(82, 196, 255, .18);
  border-radius: 7px;
}

.threshold-group > strong,
.congestion-levels > strong {
  color: #38ffb7;
  font-size: 12px;
}

.threshold-group label span {
  display: block;
  margin-bottom: 5px;
  color: rgba(201, 255, 247, .54);
  font-size: 11px;
}

.congestion-levels {
  display: grid;
  gap: 8px;
  padding: 10px;
  background: rgba(2, 18, 28, .62);
  border: 1px solid rgba(82, 196, 255, .18);
  border-radius: 7px;
}

.level-strip {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
}

.level-strip span {
  min-width: 0;
  padding: 8px;
  color: rgba(226, 255, 251, .82);
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--level-color, #94a3b8) 18%, transparent), transparent),
    rgba(1, 10, 17, .52);
  border: 1px solid color-mix(in srgb, var(--level-color, #94a3b8) 32%, transparent);
  border-radius: 6px;
  font-size: 11px;
}

.level-strip i {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 5px;
  background: var(--level-color, #94a3b8);
  border-radius: 50%;
  box-shadow: 0 0 10px var(--level-color, #94a3b8);
}

.level-strip b {
  display: block;
  margin-top: 4px;
  overflow: hidden;
  color: #fff;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.threshold-json {
  color: rgba(226, 255, 251, .72);
  font-size: 12px;
}

.threshold-json summary {
  cursor: pointer;
}

.history-panel {
  display: grid;
  gap: 10px;
}

.history-query {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  padding: 10px;
  background: rgba(2, 18, 28, .62);
  border: 1px solid rgba(82, 196, 255, .18);
  border-radius: 7px;
}

.history-query label span {
  display: block;
  margin-bottom: 5px;
  color: rgba(201, 255, 247, .54);
  font-size: 11px;
}

.history-toolbar,
.frame-picker {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px;
  color: rgba(226, 255, 251, .7);
  background: rgba(2, 18, 28, .62);
  border: 1px solid rgba(82, 196, 255, .18);
  border-radius: 7px;
  font-size: 12px;
}

.history-toolbar strong {
  color: #fff;
}

.history-toolbar strong.danger {
  color: #ff9f43;
}

.history-toolbar > div {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.history-content {
  display: grid;
  gap: 10px;
}

.history-overview {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.history-overview article {
  min-width: 0;
  padding: 10px;
  background: rgba(2, 18, 28, .62);
  border: 1px solid rgba(82, 196, 255, .18);
  border-radius: 7px;
}

.history-overview span,
.history-overview strong {
  display: block;
}

.history-overview span {
  color: rgba(201, 255, 247, .54);
  font-size: 11px;
}

.history-overview strong {
  margin-top: 5px;
  overflow: hidden;
  color: #fff;
  font-size: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.frame-picker {
  align-items: stretch;
  flex-direction: column;
}

.frame-picker input {
  accent-color: #38ffb7;
}

.frame-ticks {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.frame-ticks button {
  min-height: 28px;
  padding: 0 8px;
  font-size: 11px;
}

.frame-ticks button.active {
  color: #041a15;
  background: #52c4ff;
  border-color: rgba(82, 196, 255, .8);
}

.history-link-row {
  cursor: default;
}

.business-flow-panel {
  display: grid;
  gap: 10px;
}

.business-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px;
  color: rgba(226, 255, 251, .7);
  background: rgba(2, 18, 28, .62);
  border: 1px solid rgba(82, 196, 255, .18);
  border-radius: 7px;
  font-size: 12px;
}

.business-toolbar strong {
  margin-left: 4px;
  color: #fff;
}

.business-content {
  display: grid;
  gap: 10px;
}

.business-overview {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.business-overview article,
.business-flow-card {
  min-width: 0;
  background: rgba(2, 18, 28, .62);
  border: 1px solid rgba(82, 196, 255, .18);
  border-radius: 7px;
}

.business-overview article {
  padding: 10px;
}

.business-overview span,
.business-overview strong {
  display: block;
}

.business-overview span {
  color: rgba(201, 255, 247, .54);
  font-size: 11px;
}

.business-overview strong {
  margin-top: 5px;
  overflow: hidden;
  color: #fff;
  font-size: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.business-flow-list {
  display: grid;
  gap: 10px;
}

.business-flow-card {
  display: grid;
  gap: 10px;
  padding: 11px;
}

.flow-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.flow-card-head div {
  min-width: 0;
}

.flow-card-head strong,
.flow-card-head span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.flow-card-head strong {
  color: #fff;
  font-size: 13px;
}

.flow-card-head span {
  margin-top: 4px;
  color: rgba(201, 255, 247, .54);
  font-size: 11px;
}

.flow-card-head b {
  flex: 0 0 auto;
  padding: 4px 8px;
  color: #041a15;
  background: #52c4ff;
  border-radius: 999px;
  font-size: 11px;
}

.flow-fields {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
}

.flow-fields span {
  min-width: 0;
  padding: 8px;
  color: rgba(201, 255, 247, .54);
  background: rgba(1, 10, 17, .5);
  border: 1px solid rgba(82, 196, 255, .14);
  border-radius: 6px;
  font-size: 11px;
}

.flow-fields strong {
  display: block;
  margin-top: 5px;
  overflow: hidden;
  color: #fff;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.flow-path {
  display: grid;
  gap: 7px;
}

.flow-path > strong {
  color: #38ffb7;
  font-size: 12px;
}

.flow-path > div {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.flow-path span {
  max-width: 100%;
  overflow: hidden;
  padding: 5px 8px;
  color: rgba(226, 255, 251, .82);
  background: rgba(56, 255, 183, .08);
  border: 1px solid rgba(56, 255, 183, .22);
  border-radius: 999px;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.link-path span {
  background: rgba(82, 196, 255, .08);
  border-color: rgba(82, 196, 255, .22);
}

.flow-json {
  color: rgba(226, 255, 251, .72);
  font-size: 12px;
}

.flow-json summary {
  cursor: pointer;
}

.link-table {
  margin-top: 10px;
  overflow: hidden;
  border: 1px solid rgba(82, 196, 255, .2);
  border-radius: 7px;
}

.link-row {
  display: grid;
  grid-template-columns: minmax(170px, 1.35fr) minmax(116px, .85fr) minmax(112px, .85fr) minmax(116px, .85fr) minmax(112px, .85fr) minmax(112px, .85fr);
  gap: 8px;
  align-items: center;
  width: 100%;
  min-height: 58px;
  padding: 9px 10px;
  color: rgba(226, 255, 251, .78);
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--level-color, #94a3b8) 18%, transparent), transparent 42%),
    rgba(2, 18, 28, .62);
  border: 0;
  border-top: 1px solid rgba(82, 196, 255, .12);
  border-left: 3px solid var(--level-color, #94a3b8);
  border-radius: 0;
  cursor: pointer;
  text-align: left;
}

.link-row.head {
  min-height: 40px;
  color: #38ffb7;
  background: rgba(56, 255, 183, .08);
  border-top: 0;
  border-left-color: transparent;
  cursor: default;
  font-size: 12px;
  font-weight: 700;
}

.link-row.active,
.link-row:not(.head):hover {
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--level-color, #94a3b8) 26%, transparent), transparent 48%),
    rgba(3, 25, 36, .92);
}

.link-row span,
.link-row strong,
.link-row small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.link-row strong,
.link-row small {
  display: block;
}

.link-row strong {
  color: #fff;
  font-size: 12px;
}

.link-row small {
  margin-top: 4px;
  color: rgba(201, 255, 247, .54);
  font-size: 10px;
}

.congestion-cell i {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 6px;
  background: var(--level-color, #94a3b8);
  border-radius: 50%;
  box-shadow: 0 0 10px var(--level-color, #94a3b8);
}

.detail-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, .8fr);
  gap: 12px;
}

dl {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 10px 0 0;
}

dl div {
  min-width: 0;
  padding: 9px;
  background: rgba(2, 18, 28, .62);
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

pre {
  max-height: 300px;
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

.empty-box {
  margin-top: 10px;
  padding: 16px;
  color: rgba(226, 255, 251, .66);
  background: rgba(2, 18, 28, .62);
  border: 1px solid rgba(82, 196, 255, .16);
  border-radius: 7px;
  font-size: 12px;
}

@media (max-width: 1180px) {
  .layout,
  .detail-grid {
    grid-template-columns: 1fr;
  }

  .summary-grid,
  .metric-groups,
  .threshold-groups,
  .level-strip,
  .history-query,
  .history-overview,
  .business-overview,
  .flow-fields {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 820px) {
  .summary-grid,
  .metric-groups,
  .threshold-groups,
  .level-strip,
  .history-query,
  .history-overview,
  .business-overview,
  .flow-fields,
  dl {
    grid-template-columns: 1fr;
  }

  .threshold-toolbar,
  .history-toolbar,
  .business-toolbar,
  .flow-card-head {
    align-items: stretch;
    flex-direction: column;
  }

  .link-row {
    grid-template-columns: minmax(0, 1fr) minmax(100px, .65fr);
  }

  .link-row span:nth-child(n+3) {
    grid-column: 1 / -1;
  }
}
</style>
