<template>
  <aside
    v-if="selectedNode || loading"
    class="node-panel"
  >
    <Teleport to="body">
      <div
        v-if="feedbackMessage"
        class="node-operation-dialog"
        :class="feedbackType"
        role="alert"
      >
        <div>
          <strong>{{ feedbackType === 'error' ? '操作失败' : '操作成功' }}</strong>
          <span>{{ feedbackMessage }}</span>
        </div>
        <button type="button" aria-label="关闭提示" @click="feedbackMessage = ''">×</button>
      </div>
    </Teleport>

    <header class="panel-header">
      <div>
        <span class="eyebrow">节点详情</span>
        <h2>{{ selectedNode?.node_id || '加载中...' }}</h2>
      </div>

      <button
        type="button"
        @click="$emit('close')"
      >
        关闭
      </button>
    </header>

    <div
      v-if="error"
      class="warning-box"
    >
      {{ error }}
    </div>

    <div
      v-if="loading && !selectedNode"
      class="loading-box"
    >
      正在读取节点详情...
    </div>

    <template v-else-if="selectedNode">
      <div class="summary-card">
        <span>{{ formatOrbitLayer(selectedNode.orbit_layer || selectedNode.orbit) || formatNodeType(selectedNode.type) }}</span>
        <strong>{{ selectedNode.node_name || (isEphemerisSatellite ? selectedNode.node_id : selectedNode.physical_node) }}</strong>
        <p v-if="isEphemerisSatellite">
          {{ formatConstellationType(selectedNode.constellation_type) }} · 平均高度 {{ formatKm(selectedNode.avg_altitude_km) }}
        </p>
        <p v-else>{{ selectedNode.role || '暂无角色说明' }}</p>
      </div>

      <div class="status-strip">
        <div :class="{ ok: selectedNode.online }">
          <span>{{ isEphemerisSatellite ? '星历状态' : '节点状态' }}</span>
          <strong>{{ isEphemerisSatellite ? '已加载' : formatOnline(selectedNode.online) }}</strong>
        </div>
        <div :class="['load-state', selectedNode.load?.level || 'idle']">
          <span>{{ isEphemerisSatellite ? '轨道层' : '负载等级' }}</span>
          <strong>{{ isEphemerisSatellite ? formatOrbitLayer(selectedNode.orbit_layer) : (selectedNode.load?.label || '-') }}</strong>
        </div>
      </div>

      <div class="info-list">
        <div>
          <span>节点编号</span>
          <strong>{{ selectedNode.node_id }}</strong>
        </div>
        <div>
          <span>物理节点</span>
          <strong>{{ selectedNode.physical_node || '-' }}</strong>
        </div>
        <div>
          <span>节点类型</span>
          <strong>{{ formatNodeType(selectedNode.node_type || selectedNode.type) }}</strong>
        </div>
        <div>
          <span>轨道层级</span>
          <strong>{{ formatOrbitLayer(selectedNode.orbit_layer || selectedNode.orbit) }}</strong>
        </div>
        <div v-if="isEphemerisSatellite">
          <span>星座类型</span>
          <strong>{{ formatConstellationType(selectedNode.constellation || selectedNode.constellation_type) }}</strong>
        </div>
        <div v-if="isEphemerisSatellite">
          <span>轨道面 / 面内序号</span>
          <strong>{{ selectedNode.plane_id || selectedNode.orbit_plane_id || '-' }} / {{ selectedNode.satellite_index || '-' }}</strong>
        </div>
        <div v-if="isEphemerisSatellite">
          <span>原始序号</span>
          <strong>{{ selectedNode.raw_index }}</strong>
        </div>
        <div v-if="isEphemerisSatellite">
          <span>平均轨道高度</span>
          <strong>{{ formatKm(selectedNode.avg_altitude_km) }}</strong>
        </div>
        <div v-if="isEphemerisSatellite">
          <span>采样点数 / 采样间隔</span>
          <strong>{{ selectedNode.sample_count }} 点 / {{ selectedNode.sample_interval_seconds }} 秒</strong>
        </div>
        <div v-if="isEphemerisSatellite">
          <span>绑定计算节点</span>
          <strong>{{ selectedNode.compute_node_id || '未绑定' }}</strong>
        </div>
        <div>
          <span>IPv4 地址</span>
          <strong>{{ selectedNode.ipv4 || '-' }}</strong>
        </div>
        <div>
          <span>逻辑 IPv4</span>
          <strong>{{ selectedNode.logical_ipv4 || '-' }}</strong>
        </div>
        <div>
          <span>逻辑 IPv6</span>
          <strong>{{ selectedNode.logical_ipv6 || '-' }}</strong>
        </div>
        <div>
          <span>物理 IPv4</span>
          <strong>{{ selectedNode.physical_ipv4 || '-' }}</strong>
        </div>
        <div>
          <span>绑定角色</span>
          <strong>{{ selectedNode.binding_role || '-' }}</strong>
        </div>
        <div>
          <span>任务队列长度</span>
          <strong>{{ formatInteger(selectedNode.task_queue_len) }}</strong>
        </div>
        <div>
          <span>负载评分</span>
          <strong>{{ selectedNode.load?.score ?? '-' }}</strong>
        </div>
        <div>
          <span>队列占比</span>
          <strong>{{ selectedNode.load?.queue_ratio ?? '-' }}</strong>
        </div>
        <div>
          <span>工作节点状态</span>
          <strong>{{ selectedNode.physical_node ? formatReady(selectedNode.worker_ready) : '未绑定物理节点' }}</strong>
        </div>
      </div>

      <section class="load-section">
        <div class="resource-heading">
          <div>
            <span>节点负载状态（3.5）</span>
            <strong>{{ selectedNode.physical_node || '未绑定物理节点' }}</strong>
            <small v-if="loadMetrics">
              {{ nodeLoadState.source || '负载评分接口' }} ·
              {{ formatResourceTime(loadMetrics.timestamp || nodeLoadState.updateTime) }}
            </small>
          </div>
          <span
            v-if="loadMetrics"
            class="load-badge"
            :style="{ color: currentLoadMeta.color, borderColor: currentLoadMeta.color }"
          >
            {{ loadMetrics.level_label || currentLoadMeta.label }} {{ formatScore(loadMetrics.score) }}
          </span>
          <button
            v-if="selectedNode.physical_node"
            type="button"
            :disabled="nodeLoadState.loadingDetail || nodeLoadState.loadingHistory"
            @click="refreshLoadNow"
          >
            刷新
          </button>
        </div>

        <div v-if="!selectedNode.physical_node" class="resource-empty">
          该虚拟节点尚未绑定物理节点，暂无 CPU、内存、NPU、任务队列综合负载评分。
        </div>
        <template v-else>
          <div v-if="nodeLoadState.detailNotice" class="resource-notice">
            {{ nodeLoadState.detailNotice }}
          </div>
          <div v-if="nodeLoadState.detailError && !loadMetrics" class="resource-error">
            {{ nodeLoadState.detailError }}
          </div>
          <div v-if="nodeLoadState.loadingDetail && !loadMetrics" class="resource-empty">
            正在计算节点综合负载...
          </div>
          <div v-if="loadMetrics" class="load-summary-grid">
            <div><span>在线状态</span><strong>{{ formatOnline(loadMetrics.online) }}</strong></div>
            <div><span>K8s 就绪</span><strong>{{ formatReady(loadMetrics.k8s_ready) }}</strong></div>
            <div><span>Worker 就绪</span><strong>{{ formatReady(loadMetrics.worker_ready) }}</strong></div>
            <div><span>任务队列</span><strong>{{ formatInteger(loadMetrics.task_queue_len) }}</strong></div>
            <div><span>拥塞判定</span><strong>{{ loadMetrics.congestion ? '已拥塞' : '未拥塞' }}</strong></div>
            <div><span>资源告警</span><strong>{{ formatAlarm(loadMetrics.alarm_level) }}</strong></div>
          </div>
          <div v-if="loadMetrics" class="load-component-grid">
            <div v-for="item in loadComponentItems" :key="item.key" class="load-component">
              <div><span>{{ item.label }}</span><strong>{{ item.text }}</strong></div>
              <i><b :style="{ width: item.width, background: item.color }"></b></i>
            </div>
          </div>
          <div class="load-legend">
            <span v-for="(meta, key) in canonicalLoadLevels" :key="key">
              <i :style="{ background: meta.color }"></i>{{ meta.label }}
            </span>
          </div>
          <div class="history-section">
            <div class="section-title">
              最近一小时综合负载趋势
              <span>{{ nodeLoadState.loadingHistory ? '更新中' : loadHistorySourceLabel }}</span>
            </div>
            <div v-if="nodeLoadState.historyNotice" class="resource-notice">
              {{ nodeLoadState.historyNotice }}
            </div>
            <div v-if="nodeLoadState.historyError && !loadHistoryPoints.length" class="resource-error">
              {{ nodeLoadState.historyError }}
            </div>
            <div class="history-chart load-history-chart">
              <div>
                <span>综合评分（0–100）</span>
                <strong>{{ loadHistoryLatest }} · {{ loadHistoryPoints.length }} 点</strong>
              </div>
              <svg viewBox="0 0 300 64" preserveAspectRatio="none" role="img" aria-label="综合负载历史曲线">
                <line x1="0" y1="62" x2="300" y2="62"></line>
                <polyline
                  v-if="loadHistoryPolyline"
                  :points="loadHistoryPolyline"
                  :style="{ stroke: currentLoadMeta.color }"
                ></polyline>
              </svg>
              <div class="history-axis">
                <span>{{ loadHistoryStart }}</span>
                <span>{{ loadHistoryEnd }}</span>
              </div>
              <small v-if="!loadHistoryPolyline">暂无足够采样点，至少需要两个时间点才能绘制趋势。</small>
            </div>
          </div>
        </template>
      </section>

      <section class="resource-section">
        <div class="resource-heading">
          <div>
            <span>物理资源状态</span>
            <strong v-if="selectedNode.physical_node">{{ selectedNode.physical_node }}</strong>
            <small v-if="resourceMetrics">
              {{ nodeResourceState.source || '资源接口' }} ·
              {{ formatResourceTime(resourceMetrics.timestamp || nodeResourceState.updateTime) }}
            </small>
          </div>
          <span v-if="resourceMetrics" class="alarm-badge" :class="resourceMetrics.alarm_level">
            {{ formatAlarm(resourceMetrics.alarm_level) }}
          </span>
          <button
            v-if="selectedNode.physical_node"
            type="button"
            :disabled="nodeResourceState.loadingDetail || nodeResourceState.loadingHistory"
            @click="refreshResourceNow"
          >
            刷新
          </button>
        </div>

        <div v-if="!selectedNode.physical_node" class="resource-empty">
          该逻辑节点尚未绑定物理节点，暂无真实 CPU、内存、磁盘和网络数据。
        </div>
        <template v-else>
          <div v-if="nodeResourceState.loadingDetail && !resourceMetrics" class="resource-empty">
            正在读取物理节点资源...
          </div>
          <div v-if="resourceFallbackNotice" class="resource-notice">
            {{ resourceFallbackNotice }}
          </div>
          <div v-if="resourceBlockingError" class="resource-error">
            {{ resourceBlockingError }}
          </div>
          <div v-if="!resourceMetrics && !nodeResourceState.loadingDetail" class="resource-empty">
            暂未获取到该节点的物理资源数据。
          </div>
          <div v-if="resourceMetrics" class="resource-grid">
            <div class="resource-meter" :class="metricLevel(resourceMetrics.cpu_percent)">
              <span>CPU 使用率</span>
              <strong>{{ formatPercent(resourceMetrics.cpu_percent) }}</strong>
              <i><b :style="{ width: meterWidth(resourceMetrics.cpu_percent) }"></b></i>
            </div>
            <div class="resource-meter" :class="metricLevel(resourceMetrics.memory_percent)">
              <span>内存使用率</span>
              <strong>{{ formatPercent(resourceMetrics.memory_percent) }}</strong>
              <i><b :style="{ width: meterWidth(resourceMetrics.memory_percent) }"></b></i>
              <small>{{ formatBytes(resourceMetrics.memory_available_bytes) }} 可用 / {{ formatBytes(resourceMetrics.memory_total_bytes) }}</small>
            </div>
            <div class="resource-meter" :class="metricLevel(resourceMetrics.disk_root_percent)">
              <span>磁盘使用率</span>
              <strong>{{ formatPercent(resourceMetrics.disk_root_percent) }}</strong>
              <i><b :style="{ width: meterWidth(resourceMetrics.disk_root_percent) }"></b></i>
              <small>{{ formatBytes(resourceMetrics.disk_root_available_bytes) }} 可用 / {{ formatBytes(resourceMetrics.disk_root_size_bytes) }}</small>
            </div>
            <div class="resource-meter compact">
              <span>系统负载 load1</span>
              <strong>{{ formatNumber(resourceMetrics.load1) }}</strong>
            </div>
          </div>

          <div v-if="resourceMetrics" class="network-grid">
            <div><span>网络接收</span><strong>↓ {{ formatRate(resourceMetrics.network_receive_bytes_per_second) }}</strong></div>
            <div><span>网络发送</span><strong>↑ {{ formatRate(resourceMetrics.network_transmit_bytes_per_second) }}</strong></div>
            <div><span>监控状态</span><strong>{{ formatOnline(resourceMetrics.online) }}</strong></div>
            <div><span>K8s 状态</span><strong>{{ formatReady(resourceMetrics.k8s_ready) }}</strong></div>
            <div><span>Worker 状态</span><strong>{{ formatReady(resourceMetrics.worker_ready) }}</strong></div>
            <div><span>任务队列</span><strong>{{ formatInteger(resourceMetrics.task_queue_len) }}</strong></div>
          </div>

          <div v-if="resourceMetrics" class="npu-status" :class="npuStatusClass">
            <strong>NPU 采集状态：{{ npuStatusText }}</strong>
            <span v-if="resourceMetrics.npu_metrics_stale">数据年龄 {{ formatCollectedValue(resourceMetrics.npu_metrics_age_seconds, '秒') }}</span>
          </div>
          <div v-if="resourceMetrics && resourceMetrics.npu_expected" class="npu-grid">
            <div><span>NPU 芯片数</span><strong>{{ formatInteger(resourceMetrics.npu_chip_count) }}</strong></div>
            <div><span>NPU 健康度</span><strong>{{ formatNpuHealth(resourceMetrics.npu_health_ok) }}</strong></div>
            <div><span>NPU AI Core</span><strong>{{ formatNpuPercent(resourceMetrics.npu_ai_core_percent) }}</strong></div>
            <div><span>NPU AI CPU</span><strong>{{ formatNpuPercent(resourceMetrics.npu_ai_cpu_percent) }}</strong></div>
            <div><span>NPU 控制 CPU</span><strong>{{ formatNpuPercent(resourceMetrics.npu_control_cpu_percent) }}</strong></div>
            <div><span>NPU 内存</span><strong>{{ formatNpuPercent(resourceMetrics.npu_memory_percent) }}</strong></div>
            <div><span>NPU 内存带宽</span><strong>{{ formatNpuPercent(resourceMetrics.npu_memory_bandwidth_percent) }}</strong></div>
            <div><span>NPU 内存用量</span><strong>{{ formatNpuMemory }}</strong></div>
            <div><span>NPU 温度</span><strong>{{ formatNpuValue(resourceMetrics.npu_temperature_celsius, '°C') }}</strong></div>
            <div><span>NPU 功率</span><strong>{{ formatNpuValue(resourceMetrics.npu_power_watts, 'W') }}</strong></div>
          </div>

          <div class="history-section">
            <div class="section-title">
              {{ historyDisplayTitle }}
              <span>{{ nodeResourceState.loadingHistory ? '更新中' : historySamplingLabel }}</span>
            </div>
            <div v-if="nodeResourceState.historyNotice" class="resource-notice">
              {{ nodeResourceState.historyNotice }}；本地曲线只包含本页打开后的数据，不代表完整过去一小时。
            </div>
            <div v-if="nodeResourceState.historyError" class="resource-error">
              {{ nodeResourceState.historyError }}
            </div>
            <div v-for="chart in historyCharts" :key="chart.metric" class="history-chart">
              <div>
                <span>{{ chart.label }} · {{ chart.sourceLabel }}</span>
                <strong>{{ chart.latest }} · {{ chart.pointCount }} 点</strong>
              </div>
              <svg viewBox="0 0 300 64" preserveAspectRatio="none" role="img" :aria-label="`${chart.label}历史曲线`">
                <line x1="0" y1="62" x2="300" y2="62"></line>
                <polyline v-if="chart.polyline" :points="chart.polyline" :style="{ stroke: chart.color }"></polyline>
              </svg>
              <div class="history-axis">
                <span>{{ chart.startLabel }}</span>
                <span>{{ chart.endLabel }}</span>
              </div>
              <small v-if="!chart.polyline">{{ chart.emptyLabel }}</small>
            </div>
          </div>
        </template>
      </section>

      <div v-if="selectedNode.has_node_model" class="model-management">
        <div class="management-toolbar">
          <button type="button" @click="toggleEditMode">
            {{ editMode ? '取消编辑' : '编辑节点档案' }}
          </button>
          <button type="button" :disabled="nodeModelState.saving" @click="allocateIpNow">
            自动分配 IP
          </button>
          <select v-model="releaseVersion" aria-label="选择释放的 IP 版本">
            <option value="both">全部 IP</option>
            <option value="ipv4">仅 IPv4</option>
            <option value="ipv6">仅 IPv6</option>
          </select>
          <button type="button" class="danger" :disabled="nodeModelState.saving" @click="releaseIpNow">
            释放 IP
          </button>
        </div>

        <div v-if="nodeModelState.actionMessage" class="success-box">
          {{ nodeModelState.actionMessage }}
        </div>

        <div v-if="editMode" class="model-form">
          <label><span>节点名称</span><input v-model.trim="modelForm.node_name" type="text" /></label>
          <label><span>逻辑 IPv4</span><input v-model.trim="modelForm.logical_ipv4" type="text" /></label>
          <div class="ip-check-actions">
            <button type="button" @click="checkIpNow">检查 IPv4</button>
          </div>
          <div v-if="nodeModelState.ipCheck" class="ip-check-result" :class="{ valid: nodeModelState.ipCheck.valid && !nodeModelState.ipCheck.conflict }">
            {{ formatIpCheck(nodeModelState.ipCheck) }}
          </div>
          <button type="button" class="primary" :disabled="nodeModelState.saving" @click="saveModelNow">
            保存节点档案
          </button>
          <small class="binding-edit-hint">物理节点绑定请在“半物理节点”模块中管理。</small>
        </div>
      </div>

      <div v-else class="model-hint">
        该节点还没有持久化节点模型。请先在“半物理节点”中执行“从星历同步节点模型”。
      </div>

      <div v-if="!isEphemerisSatellite || selectedNode.compute_node_id" class="pod-section">
        <div class="section-title">
          工作容器
          <span>{{ workerPods.length }}</span>
        </div>
        <div
          v-for="pod in workerPods"
          :key="pod.pod"
          class="pod-card"
        >
          <strong>{{ pod.pod }}</strong>
          <span>{{ formatPodPhase(pod.phase) }} / {{ pod.ready ? '就绪' : '未就绪' }}</span>
        </div>
        <div
          v-if="workerPods.length === 0"
          class="empty-box"
        >
          暂无 worker pod
        </div>
      </div>
    </template>
  </aside>
</template>

<script>
import { useNodeModelStore } from '@/store/nodeModelStore'
import { useResourceStore } from '@/store/resourceStore'
import { LOAD_LEVEL_META, useLoadStore } from '@/store/loadStore'

export default {
  name: 'NodeDetailPanel',
  emits: ['close'],
  setup() {
    const {
      state,
      saveModel,
      checkIp,
      allocateIp,
      releaseIp
    } = useNodeModelStore()
    const {
      state: nodeResourceState,
      fetchResourceDetail,
      fetchResourceHistories
    } = useResourceStore()
    const {
      state: nodeLoadState,
      fetchLoadDetail,
      fetchLoadHistory
    } = useLoadStore()

    return {
      nodeModelState: state,
      saveNodeModel: saveModel,
      checkNodeIp: checkIp,
      allocateNodeIp: allocateIp,
      releaseNodeIp: releaseIp,
      nodeResourceState,
      fetchNodeResource: fetchResourceDetail,
      fetchNodeResourceHistories: fetchResourceHistories,
      nodeLoadState,
      loadLevels: LOAD_LEVEL_META,
      fetchNodeLoad: fetchLoadDetail,
      fetchNodeLoadHistory: fetchLoadHistory
    }
  },
  props: {
    selectedNode: {
      type: Object,
      default: null
    },
    loading: {
      type: Boolean,
      default: false
    },
    error: {
      type: String,
      default: ''
    }
  },
  data() {
    return {
      editMode: false,
      feedbackMessage: '',
      feedbackType: 'success',
      releaseVersion: 'both',
      modelForm: {
        node_name: '',
        logical_ipv4: ''
      }
    }
  },
  computed: {
    isEphemerisSatellite() {
      return (this.selectedNode?.node_type || this.selectedNode?.type) === 'satellite'
    },
    workerPods() {
      return Array.isArray(this.selectedNode?.worker_pods) ? this.selectedNode.worker_pods : []
    },
    loadMetrics() {
      const direct = this.selectedNode?.load
      const candidate = this.nodeLoadState.selectedNode
      if (!candidate || !this.selectedNode) return direct || null
      const nodeId = String(this.selectedNode.node_id || '')
      const physicalNode = String(this.selectedNode.physical_node || '')
      const logicalMatches = [candidate.node_id, candidate.logical_node_id, candidate.virtual_node_id]
        .some((value) => value && String(value) === nodeId)
      const physicalMatches = [candidate.physical_node, candidate.physical_node_id, candidate.worker_node]
        .some((value) => physicalNode && value && String(value) === physicalNode)
      return logicalMatches || physicalMatches ? candidate : (direct || null)
    },
    currentLoadMeta() {
      return this.loadLevels[this.loadMetrics?.level] || this.loadLevels.idle
    },
    canonicalLoadLevels() {
      return Object.fromEntries(['idle', 'smooth', 'normal', 'light', 'medium', 'heavy', 'offline']
        .map((key) => [key, this.loadLevels[key]]))
    },
    loadComponentItems() {
      const values = this.loadMetrics?.components || {}
      const definitions = [
        ['cpu_percent', 'CPU'],
        ['memory_percent', '内存'],
        ['disk_root_percent', '磁盘'],
        ['npu_ai_core_percent', 'NPU AI Core'],
        ['npu_memory_percent', 'NPU 内存'],
        ['task_queue_percent', '任务队列'],
        ['availability_penalty', '可用性惩罚']
      ]
      return definitions.map(([key, label]) => {
        const value = values[key]
        const collected = this.hasNumericValue(value)
        return {
          key,
          label,
          text: collected ? `${Number(value).toFixed(1)}%` : '未采集',
          width: collected ? this.meterWidth(value) : '0%',
          color: collected ? this.loadColorForScore(value) : '#62717d'
        }
      })
    },
    loadHistoryPoints() {
      return this.nodeLoadState.history?.points || []
    },
    loadHistoryPolyline() {
      return this.buildScorePolyline(this.loadHistoryPoints)
    },
    loadHistoryLatest() {
      const value = this.loadHistoryPoints[this.loadHistoryPoints.length - 1]?.score
      return this.hasNumericValue(value) ? Number(value).toFixed(1) : '-'
    },
    loadHistoryStart() {
      return this.loadHistoryPoints.length ? this.formatHistoryTime(this.loadHistoryPoints[0].timestamp) : '--:--:--'
    },
    loadHistoryEnd() {
      const point = this.loadHistoryPoints[this.loadHistoryPoints.length - 1]
      return point ? this.formatHistoryTime(point.timestamp) : '--:--:--'
    },
    loadHistorySourceLabel() {
      return this.nodeLoadState.history?.source === 'local' ? '本页本地采样' : '后端历史采样'
    },
    resourceMetrics() {
      if (this.selectedNode?.resource_metrics) return this.selectedNode.resource_metrics
      const candidate = this.nodeResourceState.selectedNode
      if (!candidate || !this.selectedNode) return null
      const nodeId = String(this.selectedNode.node_id || '')
      const physicalNode = String(this.selectedNode.physical_node || '')
      const logicalMatches = [candidate.node_id, candidate.logical_node_id, candidate.virtual_node_id]
        .some((value) => value && String(value) === nodeId)
      const physicalMatches = [
        candidate.physical_node,
        candidate.physical_node_id,
        candidate.worker_node,
        candidate.node,
        candidate.node_id
      ].some((value) => physicalNode && value && String(value) === physicalNode)
      return logicalMatches || physicalMatches ? candidate : null
    },
    resourceFallbackNotice() {
      if (!this.resourceMetrics) return ''
      if (this.nodeResourceState.detailNotice) {
        return this.nodeResourceState.nodesError
          ? `${this.nodeResourceState.detailNotice}；后台自动更新也暂不可用`
          : this.nodeResourceState.detailNotice
      }
      return this.nodeResourceState.nodesError
        ? '后台自动更新暂不可用，当前显示最近一次成功采集的数据'
        : ''
    },
    resourceBlockingError() {
      if (this.resourceMetrics) return ''
      return this.nodeResourceState.detailError || this.nodeResourceState.nodesError || ''
    },
    historyDisplayTitle() {
      const histories = Object.values(this.nodeResourceState.histories || {})
      if (histories.some((history) => history?.source === 'local')) {
        return '本页资源趋势（本地滚动）'
      }
      return histories.some((history) => history?.stale)
        ? '最近一小时资源趋势（上次成功数据）'
        : '最近一小时资源趋势'
    },
    historySamplingLabel() {
      const histories = Object.values(this.nodeResourceState.histories || {})
      const history = histories.find((item) => item?.step)
      const step = history?.step || this.nodeResourceState.historyStepSeconds || 60
      const isLocal = histories.some((item) => item?.source === 'local')
      return `${step} 秒${isLocal ? '本地' : '后端'}采样`
    },
    historyCharts() {
      const definitions = [
        { metric: 'cpu_percent', label: 'CPU', color: '#38ffb7' },
        { metric: 'memory_percent', label: '内存', color: '#52c4ff' },
        { metric: 'disk_root_percent', label: '磁盘', color: '#ffb657' }
      ]
      if (this.resourceMetrics?.npu_expected || this.resourceMetrics?.npu_metrics_available) {
        definitions.push(
          { metric: 'npu_ai_core_percent', label: 'NPU AI Core', color: '#b694ff' },
          { metric: 'npu_memory_percent', label: 'NPU 内存', color: '#ff74cf' },
          { metric: 'npu_temperature_celsius', label: 'NPU 温度', color: '#ff916c', unit: '°C' },
          { metric: 'npu_power_watts', label: 'NPU 功率', color: '#ffe56c', unit: 'W' }
        )
      }
      return definitions.map((chart) => {
        const history = this.nodeResourceState.histories?.[chart.metric] || {}
        const points = history.points || []
        const values = points
          .filter((point) => point?.value !== null && point?.value !== undefined && point?.value !== '')
          .map((point) => Number(point.value))
          .filter(Number.isFinite)
        return {
          ...chart,
          polyline: this.buildHistoryPolyline(points),
          latest: values.length ? `${values[values.length - 1].toFixed(1)}${chart.unit || '%'}` : '-',
          pointCount: values.length,
          sourceLabel: history.stale ? '后端历史（上次成功）' : ({
            backend: '后端历史',
            local: '本页实时缓存',
            unavailable: '暂不可用'
          })[history.source] || '等待查询',
          startLabel: points.length ? this.formatHistoryTime(points[0].timestamp) : '--:--:--',
          endLabel: points.length ? this.formatHistoryTime(points[points.length - 1].timestamp) : '--:--:--',
          emptyLabel: history.source === 'local' && points.length
            ? '本地采样正在积累，获得第二个时间点后绘制曲线'
            : (history.source === 'unavailable' ? '后端历史不可用，本地采样正在等待首个时间点' : '暂无历史采样')
        }
      })
    },
    npuStatusClass() {
      if (!this.resourceMetrics?.npu_expected) return 'not-expected'
      if (this.resourceMetrics.npu_health_ok === false) return 'critical'
      if (this.resourceMetrics.npu_metrics_available !== true || this.resourceMetrics.npu_metrics_stale) return 'warning'
      return 'normal'
    },
    npuStatusText() {
      if (!this.resourceMetrics?.npu_expected) return '该物理节点未配置 NPU'
      if (this.resourceMetrics.npu_metrics_available !== true) return 'NPU 指标不可用'
      if (this.resourceMetrics.npu_metrics_stale) return 'NPU 指标已过期'
      if (this.resourceMetrics.npu_collector_success === false) return 'NPU 采集器异常'
      return '采集正常'
    },
    formatNpuMemory() {
      if (this.resourceMetrics?.npu_metrics_available !== true) return '不可用'
      return `${this.formatBytes(this.resourceMetrics.npu_memory_used_bytes)} / ${this.formatBytes(this.resourceMetrics.npu_memory_total_bytes)}`
    }
  },
  watch: {
    selectedNode: {
      immediate: true,
      handler(node, previousNode) {
        const nodeChanged = node?.node_id !== previousNode?.node_id
        if (nodeChanged) {
          this.editMode = false
          this.feedbackMessage = ''
          this.nodeModelState.ipCheck = null
        }
        // 资源和负载会周期性刷新，并让 selectedNode 生成一个新对象。
        // 正在编辑同一个节点时保留表单，避免后台刷新把编辑区关闭。
        if (this.editMode && !nodeChanged) return
        this.modelForm = {
          node_name: node?.node_name || '',
          logical_ipv4: node?.logical_ipv4 || ''
        }
      }
    }
  },
  methods: {
    toggleEditMode() {
      this.editMode = !this.editMode
    },
    async refreshLoadNow() {
      if (!this.selectedNode?.node_id || !this.selectedNode?.physical_node) return
      try {
        await Promise.all([
          this.fetchNodeLoad(this.selectedNode.node_id, this.selectedNode.physical_node),
          this.fetchNodeLoadHistory(this.selectedNode.node_id, this.selectedNode.physical_node)
        ])
      } catch (error) {
        this.showFeedback(error?.message || '刷新节点负载失败', 'error')
      }
    },
    async refreshResourceNow() {
      if (!this.selectedNode?.node_id || !this.selectedNode?.physical_node) return
      try {
        await Promise.all([
          this.fetchNodeResource(this.selectedNode.node_id, this.selectedNode.physical_node),
          this.fetchNodeResourceHistories(this.selectedNode.node_id, this.selectedNode.physical_node)
        ])
      } catch (error) {
        this.showFeedback(error?.message || '刷新节点资源失败', 'error')
      }
    },
    formatPercent(value) {
      return this.hasNumericValue(value) ? `${Number(value).toFixed(1)}%` : '未采集'
    },
    formatCollectedPercent(value) {
      return value === null || value === undefined ? '未采集' : this.formatPercent(value)
    },
    formatCollectedValue(value, unit) {
      return this.hasNumericValue(value) ? `${Number(value).toFixed(1)} ${unit}` : '未采集'
    },
    formatNpuPercent(value) {
      return this.resourceMetrics?.npu_metrics_available === true
        ? this.formatCollectedPercent(value)
        : '不可用'
    },
    formatNpuValue(value, unit) {
      return this.resourceMetrics?.npu_metrics_available === true
        ? this.formatCollectedValue(value, unit)
        : '不可用'
    },
    formatNpuHealth(value) {
      if (this.resourceMetrics?.npu_metrics_available !== true) return '不可用'
      if (value === null || value === undefined) return '未采集'
      return value ? '健康' : '异常'
    },
    formatNumber(value) {
      return this.hasNumericValue(value) ? Number(value).toFixed(2) : '未采集'
    },
    formatInteger(value) {
      return this.hasNumericValue(value) ? String(Math.round(Number(value))) : '未采集'
    },
    formatOnline(value) {
      if (value === null || value === undefined) return '未采集'
      return value ? '在线' : '离线'
    },
    formatReady(value) {
      if (value === null || value === undefined) return '未采集'
      return value ? '就绪' : '未就绪'
    },
    formatResourceTime(value) {
      if (!value) return '更新时间未知'
      const rawValue = typeof value === 'number' && value < 1000000000000 ? value * 1000 : value
      const date = new Date(rawValue)
      return Number.isNaN(date.getTime())
        ? '更新时间未知'
        : `更新于 ${date.toLocaleTimeString('zh-CN', { hour12: false })}`
    },
    formatHistoryTime(value) {
      const numeric = Number(value)
      const rawValue = Number.isFinite(numeric) && numeric < 1000000000000 ? numeric * 1000 : value
      const date = new Date(rawValue)
      return Number.isNaN(date.getTime())
        ? '--:--:--'
        : date.toLocaleTimeString('zh-CN', { hour12: false })
    },
    hasNumericValue(value) {
      return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
    },
    formatBytes(value) {
      if (!this.hasNumericValue(value)) return '未采集'
      const bytes = Number(value)
      const units = ['B', 'KB', 'MB', 'GB', 'TB']
      let size = Math.max(bytes, 0)
      let unitIndex = 0
      while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024
        unitIndex += 1
      }
      return `${size.toFixed(unitIndex > 2 ? 1 : 0)} ${units[unitIndex]}`
    },
    formatRate(value) {
      const text = this.formatBytes(value)
      return text === '未采集' ? text : `${text}/s`
    },
    meterWidth(value) {
      if (!this.hasNumericValue(value)) return '0%'
      const percent = Number(value)
      return `${Math.max(0, Math.min(100, percent))}%`
    },
    metricLevel(value) {
      if (!this.hasNumericValue(value)) return 'unknown'
      const percent = Number(value)
      if (percent >= 90) return 'critical'
      if (percent >= 75) return 'warning'
      return 'normal'
    },
    formatAlarm(value) {
      return ({
        normal: '正常',
        warning: '告警',
        critical: '严重告警',
        offline: '离线'
      })[value] || '状态未知'
    },
    formatScore(value) {
      return this.hasNumericValue(value) ? Number(value).toFixed(1) : '-'
    },
    loadColorForScore(value) {
      const score = Number(value)
      if (score >= 85) return this.loadLevels.heavy.color
      if (score >= 70) return this.loadLevels.medium.color
      if (score >= 55) return this.loadLevels.light.color
      if (score >= 30) return this.loadLevels.normal.color
      if (score >= 10) return this.loadLevels.smooth.color
      return this.loadLevels.idle.color
    },
    buildScorePolyline(points = []) {
      return this.buildHistoryPolyline(points.map((point) => ({ ...point, value: point.score })))
    },
    buildHistoryPolyline(points = []) {
      const validPoints = points
        .filter((point) => point?.value !== null && point?.value !== undefined && point?.value !== '')
        .map((point) => Number(point.value))
        .filter(Number.isFinite)
      if (validPoints.length < 2) return ''
      return validPoints.map((value, index) => {
        const x = (index * 300) / Math.max(validPoints.length - 1, 1)
        const y = 58 - (Math.max(0, Math.min(100, value)) / 100) * 52
        return `${x.toFixed(1)},${y.toFixed(1)}`
      }).join(' ')
    },
    showFeedback(message, type = 'success') {
      this.feedbackType = type
      this.feedbackMessage = message || (type === 'error' ? '操作失败' : '操作成功')
    },
    optional(value) {
      return String(value || '').trim() || null
    },
    async saveModelNow() {
      if (!this.selectedNode?.node_id) return
      try {
        await this.saveNodeModel(this.selectedNode.node_id, {
          node_name: this.optional(this.modelForm.node_name),
          logical_ipv4: this.optional(this.modelForm.logical_ipv4)
        })
        this.editMode = false
        this.showFeedback('节点档案已保存', 'success')
      } catch (error) {
        this.showFeedback(error?.message || this.nodeModelState.error || '保存节点档案失败', 'error')
      }
    },
    async checkIpNow() {
      const ip = this.modelForm.logical_ipv4
      if (!ip || !this.selectedNode?.node_id) return
      try {
        await this.checkNodeIp({
          ip,
          nodeId: this.selectedNode.node_id,
          layer: this.selectedNode.orbit_layer || this.selectedNode.orbit
        })
      } catch (_) {
        // 错误由共享状态显示。
      }
    },
    formatIpCheck(result) {
      if (!result) return ''
      if (result.conflict) {
        const owner = result.owner_node_id || result.owner
        return `地址冲突${owner ? `：已被 ${owner} 使用` : ''}`
      }
      if (result.valid === false) return result.message || 'IP 地址格式或网段不符合要求'
      if (result.in_pool === false) return '地址有效，但不在该轨道层的 IP 池中'
      return result.message || '地址可用'
    },
    async allocateIpNow() {
      if (!this.selectedNode?.node_id) return
      if (
        (this.selectedNode.logical_ipv4 || this.selectedNode.logical_ipv6) &&
        !window.confirm('自动分配会覆盖该节点现有的逻辑 IP，确定继续吗？')
      ) return
      try {
        await this.allocateNodeIp(this.selectedNode.node_id)
      } catch (_) {
        // 错误由共享状态显示。
      }
    },
    async releaseIpNow() {
      if (!this.selectedNode?.node_id) return
      const label = ({ both: 'IPv4 和 IPv6', ipv4: 'IPv4', ipv6: 'IPv6' })[this.releaseVersion]
      if (!window.confirm(`确定释放 ${this.selectedNode.node_id} 的 ${label} 地址吗？`)) return
      try {
        await this.releaseNodeIp(this.selectedNode.node_id, this.releaseVersion)
      } catch (_) {
        // 错误由共享状态显示。
      }
    },
    formatKm(value) {
      return Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)} km` : '-'
    },
    formatNodeType(value) {
      return ({
        satellite: '卫星节点',
        ground: '地面节点',
        compute: '计算节点'
      })[String(value || '').toLowerCase()] || value || '-'
    },
    formatOrbitLayer(value) {
      return ({
        LEO: '低轨',
        MEO: '中轨',
        HEO: '高轨',
        GEO: '地球同步轨道',
        GROUND: '地面'
      })[String(value || '').toUpperCase()] || value || '-'
    },
    formatConstellationType(value) {
      const text = String(value || '')
      if (!text) return '-'
      if (text === 'MEO' || text.includes('MEO')) return '中轨星座'
      if (text === 'LEO' || text.includes('LEO')) return '低轨星座'
      if (text.includes('HEO') || text.includes('GEO')) return '高轨 / 地球同步星座'
      return text
    },
    formatPodPhase(value) {
      return ({
        Running: '运行中',
        Pending: '等待中',
        Succeeded: '已完成',
        Failed: '失败',
        Unknown: '未知'
      })[value] || value || '-'
    }
  }
}
</script>

<style scoped>
.node-operation-dialog {
  position: fixed;
  top: 76px;
  left: 50%;
  z-index: 130;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  width: min(430px, calc(100vw - 32px));
  padding: 14px;
  transform: translateX(-50%);
  color: #dcfff3;
  background: rgba(4, 31, 30, .97);
  border: 1px solid rgba(56, 255, 183, .54);
  border-radius: 8px;
  box-shadow: 0 16px 42px rgba(0, 0, 0, .52), 0 0 22px rgba(56, 255, 183, .12);
  backdrop-filter: blur(12px);
}

.node-operation-dialog.error {
  color: #ffe5ea;
  background: rgba(48, 12, 22, .98);
  border-color: rgba(255, 77, 109, .62);
}

.node-operation-dialog strong,
.node-operation-dialog span {
  display: block;
}

.node-operation-dialog strong {
  margin-bottom: 5px;
  color: #78ffd0;
  font-size: 14px;
}

.node-operation-dialog.error strong {
  color: #ff9bae;
}

.node-operation-dialog span {
  font-size: 12px;
  line-height: 1.65;
}

.node-operation-dialog button {
  flex: 0 0 auto;
  width: 26px;
  height: 26px;
  margin-left: 12px;
  padding: 0;
  color: inherit;
  background: transparent;
  border: 0;
  font-size: 20px;
  line-height: 1;
}

.node-panel {
  position: fixed;
  top: 50%;
  right: 24px;
  z-index: 32;
  width: 352px;
  max-height: min(734px, calc(100vh - 64px));
  padding: 18px;
  overflow: auto;
  transform: translateY(-50%);
  color: #f2ffff;
  background:
    linear-gradient(180deg, rgba(4, 24, 32, .94), rgba(2, 9, 18, .9)),
    radial-gradient(circle at 90% 0, rgba(82, 196, 255, .18), transparent 36%);
  border: 1px solid rgba(82, 196, 255, .38);
  border-radius: 8px;
  box-shadow: 0 22px 62px rgba(0, 0, 0, .46), 0 0 26px rgba(82, 196, 255, .12);
  backdrop-filter: blur(16px);
  font-family: 'Microsoft YaHei', 'PingFang SC', Arial, sans-serif;
}

.node-panel::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
  background:
    linear-gradient(270deg, rgba(82, 196, 255, .08), transparent 18%),
    repeating-linear-gradient(0deg, rgba(255, 255, 255, .025) 0, rgba(255, 255, 255, .025) 1px, transparent 1px, transparent 7px);
}

.panel-header,
.summary-card,
.status-strip,
.info-list,
.resource-section,
.pod-section,
.model-management,
.model-hint,
.loading-box,
.warning-box,
.success-box {
  position: relative;
  z-index: 1;
}

.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(89, 216, 255, .2);
}

.eyebrow {
  color: #52c4ff;
  font-size: 11px;
}

h2 {
  margin-top: 4px;
  color: #fff;
  font-size: 20px;
}

button {
  width: 44px;
  height: 28px;
  color: #dffff8;
  background: rgba(82, 196, 255, .08);
  border: 1px solid rgba(82, 196, 255, .5);
  border-radius: 5px;
  cursor: pointer;
}

button:hover {
  color: #fff;
  border-color: rgba(82, 196, 255, .78);
}

button:disabled {
  cursor: wait;
  opacity: .5;
}

.summary-card,
.info-list div,
.pod-card,
.loading-box,
.warning-box,
.empty-box {
  background: rgba(2, 18, 28, .72);
  border: 1px solid rgba(82, 196, 255, .24);
  border-radius: 7px;
}

.warning-box {
  margin-top: 12px;
  padding: 10px;
  color: #ffd86b;
  border-color: rgba(255, 216, 107, .34);
  background: rgba(255, 216, 107, .08);
  font-size: 12px;
}

.summary-card {
  margin-top: 16px;
  padding: 14px;
  background:
    linear-gradient(135deg, rgba(82, 196, 255, .13), rgba(56, 255, 183, .04)),
    rgba(2, 18, 28, .68);
}

.summary-card span,
.info-list span,
.status-strip span {
  display: block;
  color: rgba(201, 255, 247, .62);
  font-size: 12px;
}

.summary-card strong {
  display: block;
  margin-top: 6px;
  color: #fff;
  font-size: 17px;
}

.summary-card p {
  margin: 8px 0 0;
  color: rgba(226, 255, 251, .68);
  font-size: 12px;
  line-height: 1.6;
}

.status-strip {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 12px;
}

.status-strip div {
  padding: 10px;
  background: rgba(255, 216, 107, .06);
  border: 1px solid rgba(255, 216, 107, .24);
  border-radius: 7px;
}

.status-strip div.ok {
  background: rgba(56, 255, 183, .08);
  border-color: rgba(56, 255, 183, .3);
}

.status-strip .light_congestion {
  background: rgba(255, 216, 107, .08);
  border-color: rgba(255, 216, 107, .35);
}

.status-strip .light {
  background: rgba(255, 152, 0, .1);
  border-color: rgba(255, 152, 0, .38);
}

.status-strip .medium {
  background: rgba(245, 124, 0, .11);
  border-color: rgba(245, 124, 0, .42);
}

.status-strip .heavy,
.status-strip .offline {
  background: rgba(211, 47, 47, .11);
  border-color: rgba(211, 47, 47, .42);
}

.status-strip .medium_congestion {
  background: rgba(255, 159, 67, .1);
  border-color: rgba(255, 159, 67, .38);
}

.status-strip .heavy_congestion {
  background: rgba(255, 77, 109, .11);
  border-color: rgba(255, 77, 109, .42);
}

.status-strip strong {
  display: block;
  margin-top: 6px;
  color: #fff;
  font-size: 13px;
}

.info-list {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.info-list div {
  padding: 10px;
}

.info-list strong {
  display: block;
  margin-top: 6px;
  color: #fff;
  font-size: 13px;
  word-break: break-all;
}

.resource-section,
.load-section {
  margin-top: 14px;
  padding: 12px;
  background:
    linear-gradient(145deg, rgba(56, 255, 183, .055), rgba(82, 196, 255, .035)),
    rgba(2, 18, 28, .72);
  border: 1px solid rgba(56, 255, 183, .24);
  border-radius: 7px;
}

.load-section {
  position: relative;
  z-index: 1;
  border-color: rgba(33, 150, 243, .28);
  background:
    linear-gradient(145deg, rgba(33, 150, 243, .07), rgba(124, 179, 66, .035)),
    rgba(2, 18, 28, .72);
}

.load-badge {
  flex: 0 0 auto;
  padding: 4px 7px;
  background: rgba(2, 12, 20, .7);
  border: 1px solid;
  border-radius: 999px;
  font-size: 10px;
  white-space: nowrap;
}

.load-summary-grid,
.load-component-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
  margin-top: 10px;
}

.load-summary-grid > div,
.load-component {
  min-width: 0;
  padding: 8px;
  background: rgba(1, 12, 20, .66);
  border: 1px solid rgba(33, 150, 243, .18);
  border-radius: 5px;
}

.load-summary-grid span,
.load-component span {
  color: rgba(201, 255, 247, .58);
  font-size: 10px;
}

.load-summary-grid strong,
.load-component strong {
  display: block;
  margin-top: 4px;
  overflow: hidden;
  color: #eaffff;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.load-component > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 5px;
}

.load-component > i {
  display: block;
  height: 3px;
  margin-top: 7px;
  overflow: hidden;
  background: rgba(255, 255, 255, .08);
  border-radius: 999px;
}

.load-component > i > b {
  display: block;
  height: 100%;
  border-radius: inherit;
}

.load-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 9px;
  margin-top: 10px;
  color: rgba(201, 255, 247, .55);
  font-size: 9px;
}

.load-legend span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.load-legend i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.load-history-chart {
  border-color: rgba(33, 150, 243, .18);
}

.resource-heading {
  display: flex;
  align-items: center;
  gap: 8px;
}

.resource-heading > div {
  min-width: 0;
  margin-right: auto;
}

.resource-heading span,
.resource-grid span,
.network-grid span,
.npu-grid span {
  display: block;
  color: rgba(201, 255, 247, .6);
  font-size: 10px;
}

.resource-heading > div > strong {
  display: block;
  margin-top: 4px;
  overflow: hidden;
  color: #eaffff;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resource-heading > div > small {
  display: block;
  margin-top: 4px;
  color: rgba(201, 255, 247, .42);
  font-size: 9px;
}

.resource-heading > button {
  flex: 0 0 auto;
  width: auto;
  min-width: 48px;
  padding: 0 8px;
  font-size: 11px;
}

.alarm-badge {
  flex: 0 0 auto;
  padding: 4px 7px;
  color: #cffff0 !important;
  background: rgba(56, 255, 183, .08);
  border: 1px solid rgba(56, 255, 183, .28);
  border-radius: 999px;
}

.alarm-badge.warning {
  color: #ffe2a8 !important;
  background: rgba(255, 184, 77, .1);
  border-color: rgba(255, 184, 77, .38);
}

.alarm-badge.critical,
.alarm-badge.offline {
  color: #ffbdc9 !important;
  background: rgba(255, 77, 109, .1);
  border-color: rgba(255, 77, 109, .38);
}

.resource-empty,
.resource-error,
.resource-notice {
  margin-top: 10px;
  padding: 9px;
  color: rgba(226, 255, 251, .64);
  background: rgba(2, 12, 20, .56);
  border: 1px dashed rgba(82, 196, 255, .2);
  border-radius: 5px;
  font-size: 11px;
  line-height: 1.65;
}

.npu-status {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 10px;
  padding: 8px 9px;
  color: #cffff0;
  background: rgba(56, 255, 183, .06);
  border: 1px solid rgba(56, 255, 183, .22);
  border-radius: 5px;
  font-size: 10px;
}

.npu-status.warning,
.npu-status.critical {
  color: #ffe0a2;
  background: rgba(255, 184, 77, .07);
  border-color: rgba(255, 184, 77, .3);
}

.npu-status.critical {
  color: #ffbdc9;
  background: rgba(255, 77, 109, .07);
  border-color: rgba(255, 77, 109, .3);
}

.npu-status.not-expected {
  color: rgba(201, 255, 247, .56);
  background: rgba(2, 12, 20, .56);
  border-color: rgba(82, 196, 255, .16);
}

.resource-error {
  color: #ffb5c1;
  background: rgba(255, 77, 109, .055);
  border-color: rgba(255, 77, 109, .28);
}

.resource-notice {
  color: #b9f6ff;
  background: rgba(82, 196, 255, .055);
  border-color: rgba(82, 196, 255, .26);
}

.resource-grid,
.network-grid,
.npu-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
  margin-top: 10px;
}

.resource-meter,
.network-grid > div,
.npu-grid > div {
  min-width: 0;
  padding: 9px;
  background: rgba(1, 12, 20, .66);
  border: 1px solid rgba(82, 196, 255, .16);
  border-radius: 5px;
}

.resource-meter > strong,
.network-grid strong,
.npu-grid strong {
  display: block;
  margin-top: 5px;
  overflow: hidden;
  color: #eaffff;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resource-meter > i {
  display: block;
  height: 3px;
  margin-top: 7px;
  overflow: hidden;
  background: rgba(255, 255, 255, .08);
  border-radius: 999px;
}

.resource-meter > i > b {
  display: block;
  height: 100%;
  background: #38ffb7;
  border-radius: inherit;
  box-shadow: 0 0 7px rgba(56, 255, 183, .32);
}

.resource-meter.warning > i > b {
  background: #ffb84d;
  box-shadow: 0 0 7px rgba(255, 184, 77, .3);
}

.resource-meter.critical > i > b {
  background: #ff4d6d;
  box-shadow: 0 0 7px rgba(255, 77, 109, .3);
}

.resource-meter.unknown > i > b {
  background: #62717d;
  box-shadow: none;
}

.resource-meter > small {
  display: block;
  margin-top: 6px;
  color: rgba(201, 255, 247, .46);
  font-size: 9px;
  line-height: 1.45;
}

.history-section {
  margin-top: 12px;
  padding-top: 11px;
  border-top: 1px solid rgba(82, 196, 255, .14);
}

.history-section .section-title > span {
  color: rgba(201, 255, 247, .45);
  font-size: 10px;
}

.history-chart {
  position: relative;
  margin-top: 8px;
  padding: 8px;
  background: rgba(1, 10, 17, .55);
  border: 1px solid rgba(82, 196, 255, .14);
  border-radius: 5px;
}

.history-chart > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: rgba(201, 255, 247, .58);
  font-size: 10px;
}

.history-chart > div strong {
  color: #eaffff;
  font-size: 11px;
}

.history-chart .history-axis {
  margin-top: -2px;
  color: rgba(201, 255, 247, .38);
  font-size: 8px;
}

.history-chart svg {
  display: block;
  width: 100%;
  height: 54px;
  margin-top: 5px;
  overflow: visible;
}

.history-chart line {
  stroke: rgba(201, 255, 247, .12);
  stroke-width: 1;
}

.history-chart polyline {
  fill: none;
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
}

.history-chart > small {
  display: block;
  margin-top: 5px;
  color: rgba(201, 255, 247, .38);
  font-size: 9px;
  line-height: 1.45;
}

.model-management,
.model-hint {
  margin-top: 14px;
  padding: 12px;
  background: rgba(2, 18, 28, .72);
  border: 1px solid rgba(82, 196, 255, .24);
  border-radius: 7px;
}

.model-hint {
  color: rgba(226, 255, 251, .68);
  font-size: 12px;
  line-height: 1.7;
}

.management-toolbar,
.ip-check-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.management-toolbar button,
.model-form button,
.ip-check-actions button {
  width: auto;
  min-width: 74px;
  padding: 0 9px;
  font-size: 12px;
}

.management-toolbar select,
.model-form input {
  height: 30px;
  color: #eaffff;
  background: rgba(2, 12, 20, .82);
  border: 1px solid rgba(82, 196, 255, .3);
  border-radius: 5px;
  outline: none;
}

.management-toolbar select {
  width: 82px;
  padding: 0 6px;
  font-size: 12px;
}

.model-form {
  display: grid;
  gap: 9px;
  margin-top: 12px;
}

.model-form label span {
  display: block;
  margin-bottom: 5px;
  color: rgba(201, 255, 247, .62);
  font-size: 12px;
}

.model-form input {
  box-sizing: border-box;
  width: 100%;
  padding: 0 9px;
}

.model-form input:focus {
  border-color: rgba(82, 196, 255, .72);
}

.management-toolbar .danger,
.model-form .danger {
  color: #ffb5c1;
  border-color: rgba(255, 77, 109, .44);
}

.model-form .primary {
  color: #baffeb;
  border-color: rgba(56, 255, 183, .46);
  background: rgba(56, 255, 183, .08);
}

.binding-edit-hint {
  display: block;
  grid-column: 1 / -1;
  color: rgba(201, 255, 247, .5);
  font-size: 10px;
  line-height: 1.5;
}

.success-box,
.ip-check-result {
  margin-top: 9px;
  padding: 8px;
  color: #8fffd8;
  background: rgba(56, 255, 183, .07);
  border: 1px solid rgba(56, 255, 183, .25);
  border-radius: 5px;
  font-size: 12px;
}

.ip-check-result:not(.valid) {
  color: #ffd86b;
  background: rgba(255, 216, 107, .06);
  border-color: rgba(255, 216, 107, .26);
}

.pod-section {
  margin-top: 14px;
}

.section-title {
  display: flex;
  justify-content: space-between;
  color: #52c4ff;
  font-size: 13px;
}

.pod-card,
.empty-box,
.loading-box {
  margin-top: 8px;
  padding: 10px;
}

.pod-card strong {
  display: block;
  color: #fff;
  font-size: 12px;
}

.pod-card span,
.empty-box,
.loading-box {
  color: rgba(226, 255, 251, .68);
  font-size: 12px;
}
</style>
