<template>
  <aside v-if="selectedLinkId || selectedLink || loading" class="link-detail-panel" @click.stop>
    <header>
      <div>
        <span>链路详情</span>
        <strong>{{ selectedLinkId || selectedLink?.id || '正在读取' }}</strong>
      </div>
      <button type="button" aria-label="关闭链路详情" @click="$emit('close')">×</button>
    </header>

    <div v-if="loading && !selectedLink" class="panel-state">正在查询该链路的实时状态...</div>
    <div v-else-if="error && !selectedLink" class="panel-state error">{{ error }}</div>

    <template v-if="selectedLink">
      <div class="link-heading">
        <span :class="['status-dot', isAvailable ? 'online' : 'offline']"></span>
        <div>
          <strong>{{ formatEndpoint(selectedLink.source) }} → {{ formatEndpoint(selectedLink.target) }}</strong>
          <small>{{ formatLinkType(selectedLink.link_type || selectedLink.type) }} · 时间序号 {{ timeIndex }}</small>
        </div>
        <em :class="congestionLevel">{{ formatCongestion(congestionLevel) }}</em>
      </div>

      <div v-if="error" class="inline-warning">{{ error }}</div>

      <section>
        <h3>传输状态</h3>
        <div class="metric-grid">
          <div><span>链路状态</span><strong>{{ isAvailable ? '可用' : '不可用' }}</strong></div>
          <div><span>当前速率</span><strong>{{ formatMbps(currentRate) }}</strong></div>
          <div><span>链路容量</span><strong>{{ formatMbps(selectedLink.capacity_mbps) }}</strong></div>
          <div><span>带宽利用率</span><strong>{{ formatPercent(selectedLink.bandwidth_utilization_percent) }}</strong></div>
          <div><span>总时延</span><strong>{{ formatMs(selectedLink.latency_ms) }}</strong></div>
          <div><span>丢包率</span><strong>{{ formatPercent(selectedLink.loss_percent) }}</strong></div>
        </div>
      </section>

      <section>
        <h3>几何与来源</h3>
        <dl>
          <div><dt>链路类型</dt><dd>{{ formatLinkType(selectedLink.link_type || selectedLink.type) }}</dd></div>
          <div><dt>传播时延</dt><dd>{{ formatMs(selectedLink.propagation_delay_ms) }}</dd></div>
          <div><dt>节点距离</dt><dd>{{ formatKm(selectedLink.distance_km) }}</dd></div>
          <div v-if="hasValue(selectedLink.elevation_deg)"><dt>地面仰角</dt><dd>{{ formatDegree(selectedLink.elevation_deg) }}</dd></div>
          <div v-if="hasValue(selectedLink.earth_clearance_km)"><dt>地球净空</dt><dd>{{ formatKm(selectedLink.earth_clearance_km) }}</dd></div>
          <div><dt>计算来源</dt><dd>{{ formatSource(selectedLink.calculation_source) }}</dd></div>
          <div><dt>判定原因</dt><dd>{{ formatReason(selectedLink.reason) }}</dd></div>
          <div><dt>阈值来源</dt><dd>{{ selectedLink.threshold_source || '-' }}</dd></div>
        </dl>
      </section>

      <section v-if="businessTypes.length">
        <h3>承载业务</h3>
        <div class="business-tags">
          <span v-for="item in businessTypes" :key="item">{{ item }}</span>
        </div>
      </section>

      <footer>
        点击三维场景中的其他链路，可直接切换右侧详情。
      </footer>
    </template>
  </aside>
</template>

<script>
import { computed } from 'vue'

const CONGESTION_LABELS = {
  idle: '空闲',
  smooth: '流畅',
  normal: '正常',
  light: '轻度拥塞',
  medium: '中度拥塞',
  heavy: '重度拥塞'
}

export default {
  name: 'LinkDetailPanel',
  props: {
    selectedLinkId: {
      type: String,
      default: ''
    },
    selectedLink: {
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
    },
    timeIndex: {
      type: Number,
      default: 0
    }
  },
  emits: ['close'],
  setup(props) {
    const isAvailable = computed(() => (
      props.selectedLink?.available ??
      props.selectedLink?.visible ??
      String(props.selectedLink?.status || '').toLowerCase() === 'up'
    ))
    const congestionLevel = computed(() => String(
      props.selectedLink?.congestion_level || props.selectedLink?.traffic_level || 'idle'
    ).toLowerCase())
    const currentRate = computed(() => (
      props.selectedLink?.current_transfer_rate_mbps ??
      props.selectedLink?.transmission_rate_mbps
    ))
    const businessTypes = computed(() => {
      const values = props.selectedLink?.business_types
      if (Array.isArray(values)) return values.filter(Boolean)
      return props.selectedLink?.business_type ? [props.selectedLink.business_type] : []
    })

    const hasValue = (value) => value !== null && value !== undefined && value !== ''
    const formatNumber = (value, digits = 2) => {
      if (!hasValue(value) || !Number.isFinite(Number(value))) return '-'
      return Number(value).toFixed(digits)
    }
    const formatMbps = (value) => `${formatNumber(value)} Mbps`
    const formatMs = (value) => `${formatNumber(value)} ms`
    const formatKm = (value) => `${formatNumber(value)} km`
    const formatPercent = (value) => `${formatNumber(value)}%`
    const formatDegree = (value) => `${formatNumber(value)}°`
    const formatEndpoint = (value) => value === 'Ground001' ? '地面中心' : (value || '-')
    const formatCongestion = (value) => CONGESTION_LABELS[value] || value || '-'
    const formatLinkType = (value) => ({
      isl: '星间链路 ISL',
      gsl: '星地链路 GSL',
      task_stream: '任务流链路',
      physical_access: '物理接入链路'
    })[value] || value || '-'
    const formatSource = (value) => ({
      ephemeris_geometry: '星历几何计算',
      task_dispatch: '任务调度',
      physical_binding: '物理绑定'
    })[value] || value || '-'
    const formatReason = (value) => ({
      visible: '当前几何条件可见',
      earth_blocked: '受地球遮挡',
      distance_exceeded: '超过最大距离',
      elevation_too_low: '地面仰角不足'
    })[value] || value || '-'

    return {
      isAvailable,
      congestionLevel,
      currentRate,
      businessTypes,
      hasValue,
      formatMbps,
      formatMs,
      formatKm,
      formatPercent,
      formatDegree,
      formatEndpoint,
      formatCongestion,
      formatLinkType,
      formatSource,
      formatReason
    }
  }
}
</script>

<style scoped>
.link-detail-panel {
  position: fixed;
  top: 88px;
  right: 18px;
  bottom: 72px;
  z-index: 36;
  box-sizing: border-box;
  width: 360px;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 15px;
  color: #eaffff;
  background:
    linear-gradient(180deg, rgba(3, 24, 32, .92), rgba(2, 10, 18, .9)),
    radial-gradient(circle at 100% 0, rgba(82, 196, 255, .15), transparent 38%);
  border: 1px solid rgba(82, 196, 255, .4);
  border-radius: 8px;
  box-shadow: 0 20px 55px rgba(0, 0, 0, .52), 0 0 24px rgba(82, 196, 255, .1);
  backdrop-filter: blur(14px);
  scrollbar-color: rgba(82, 196, 255, .48) rgba(1, 10, 17, .72);
  scrollbar-width: thin;
  font-family: 'Microsoft YaHei', 'PingFang SC', Arial, sans-serif;
}

header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(82, 196, 255, .2);
}

header div,
.link-heading div {
  display: grid;
  min-width: 0;
  gap: 4px;
}

header span,
h3 {
  color: #38ffb7;
  font-size: 11px;
  letter-spacing: .08em;
}

header strong {
  overflow: hidden;
  color: #fff;
  font-size: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

header button {
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  color: #dffff8;
  background: rgba(2, 18, 28, .62);
  border: 1px solid rgba(82, 196, 255, .28);
  border-radius: 5px;
  cursor: pointer;
  font-size: 18px;
}

.panel-state,
.inline-warning {
  margin-top: 13px;
  padding: 12px;
  color: #bdefff;
  background: rgba(82, 196, 255, .07);
  border: 1px solid rgba(82, 196, 255, .2);
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.6;
}

.panel-state.error,
.inline-warning {
  color: #ffd1da;
  background: rgba(255, 77, 109, .07);
  border-color: rgba(255, 77, 109, .26);
}

.link-heading {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 15px 0 3px;
}

.link-heading strong {
  color: #fff;
  font-size: 15px;
}

.link-heading small {
  color: rgba(191, 225, 229, .62);
  font-size: 11px;
}

.link-heading em {
  padding: 4px 7px;
  color: #94a3b8;
  background: rgba(148, 163, 184, .1);
  border: 1px solid currentColor;
  border-radius: 99px;
  font-size: 10px;
  font-style: normal;
  white-space: nowrap;
}

.link-heading em.smooth { color: #38ffb7; }
.link-heading em.normal { color: #52c4ff; }
.link-heading em.light { color: #ffd86b; }
.link-heading em.medium { color: #ff9f43; }
.link-heading em.heavy { color: #ff4d6d; }

.status-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  box-shadow: 0 0 12px currentColor;
}

.status-dot.online { color: #38ffb7; background: #38ffb7; }
.status-dot.offline { color: #ff4d6d; background: #ff4d6d; }

section {
  margin-top: 15px;
  padding: 12px;
  background: rgba(2, 18, 28, .5);
  border: 1px solid rgba(82, 196, 255, .15);
  border-radius: 7px;
}

h3 {
  margin: 0 0 10px;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.metric-grid div {
  display: grid;
  gap: 3px;
  padding: 9px;
  background: rgba(0, 0, 0, .18);
  border-radius: 5px;
}

.metric-grid span,
dt {
  color: rgba(184, 218, 223, .62);
  font-size: 10px;
}

.metric-grid strong {
  color: #fff;
  font-size: 13px;
}

dl {
  display: grid;
  gap: 0;
  margin: 0;
}

dl div {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  gap: 10px;
  padding: 7px 0;
  border-bottom: 1px solid rgba(82, 196, 255, .09);
}

dl div:last-child {
  border-bottom: 0;
}

dd {
  margin: 0;
  overflow-wrap: anywhere;
  color: #eaffff;
  font-size: 11px;
  text-align: right;
}

.business-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.business-tags span {
  padding: 4px 7px;
  color: #b9ffe7;
  background: rgba(56, 255, 183, .08);
  border: 1px solid rgba(56, 255, 183, .24);
  border-radius: 4px;
  font-size: 10px;
}

footer {
  padding: 13px 3px 0;
  color: rgba(184, 218, 223, .5);
  font-size: 10px;
  line-height: 1.5;
}

@media (max-width: 900px) {
  .link-detail-panel {
    top: auto;
    right: 12px;
    bottom: 12px;
    left: 90px;
    width: auto;
    max-height: 56vh;
  }
}
</style>
