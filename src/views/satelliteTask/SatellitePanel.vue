<template>
  <div class="sat-panel" ref="panelRef">
    <!-- 面板标题 -->
    <div class="panel-header">
      <span class="title">卫星状态列表</span>
      <div class="header-line"></div>
    </div>

    <!-- 2行2列卫星网格，完全无滚动 -->
    <div class="sat-grid">
      <div
        class="sat-item"
        v-for="sat in satData"
        :key="sat.id"
        @click="$emit('clickSat', sat.id)"
        @mouseenter="handleEnter(sat)"
        @mouseleave="handleSatLeave"
      >
        <span class="status-dot" :style="{ backgroundColor: sat.color }"></span>
        <div class="sat-main">
          <div class="sat-name">{{ sat.name }}</div>
          <div class="sat-node">节点：{{ sat.nodeName }}</div>
        </div>
        <span class="status-tag" :class="sat.status === 'online' ? 'online' : 'offline'">
          {{ sat.status === 'online' ? '在线' : '离线' }}
        </span>
      </div>
    </div>

    <!-- 悬浮详情弹窗 -->
    <div
      v-if="activeSat"
      ref="tooltipRef"
      class="sat-tooltip"
      :style="tooltipPos"
      @mouseenter="tooltipHover = true"
      @mouseleave="tooltipHover = false"
    >
      <div class="tip-title">{{ activeSat.name }} 详细工况</div>

      <div class="tip-row">
        <span class="label">镜像版本：</span>
        <span class="value">{{ activeSat.image }}</span>
      </div>

      <div class="tip-row">
        <span class="label">CPU实时使用率：</span>
        <span class="value">{{ activeSat.cpu }} %</span>
      </div>

      <!-- 原生SVG CPU曲线 零第三方依赖 -->
      <div class="cpu-chart-wrap">
        <svg width="100%" height="60" viewBox="0 0 320 60">
          <g stroke="rgba(0,255,255,0.1)">
            <line x1="0" y1="15" x2="320" y2="15"/>
            <line x1="0" y1="30" x2="320" y2="30"/>
            <line x1="0" y1="45" x2="320" y2="45"/>
          </g>
          <polyline
            :points="cpuPoints"
            fill="none"
            stroke="#00ffff"
            stroke-width="2"
          />
          <polygon
            :points="cpuAreaPoints"
            fill="url(#cpuLinear)"
          />
          <defs>
            <linearGradient id="cpuLinear" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#00ffff" stop-opacity="0.35"/>
              <stop offset="100%" stop-color="#00ffff" stop-opacity="0.02"/>
            </linearGradient>
          </defs>
        </svg>
      </div>

      <div class="tip-row">
        <span class="label">内存占用：</span>
        <span class="value">{{ activeSat.memoryUsed }} / {{ activeSat.memoryTotal }} MiB</span>
      </div>

      <div class="tip-row">
        <span class="label">IO速率：</span>
        <span class="value">上行 {{ activeSat.ioUp }} MB/s  下行 {{ activeSat.ioDown }} MB/s</span>
      </div>

      <div class="tip-row">
        <span class="label">运行时长：</span>
        <span class="value">{{ activeSat.runTime }}</span>
      </div>

      <div class="tip-row">
        <span class="label">重启次数：</span>
        <span class="value">{{ activeSat.restartCount }} 次</span>
      </div>

      <div class="log-wrap">
        <div class="log-title">最新运行日志</div>
        <div class="log-content">{{ activeSat.latestLog }}</div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    satData: {
      type: Array,
      default() {
        return [
          {
            id: 'sat-01',
            name: '资源卫星',
            color: '#ff2255',
            nodeName: 'k8s-18-node01(192.168.32.12)',
            status: 'online',
            image: 'nginx:1.7.9',
            cpu: 46.2,
            memoryUsed: 54.1,
            memoryTotal: 256,
            ioUp: 2.3,
            ioDown: 1.8,
            runTime: '9小时21分',
            restartCount: 0,
            latestLog: '2025-07-03 容器启动成功，业务模型正常加载，80端口监听就绪'
          },
          {
            id: 'sat-02',
            name: '通信卫星',
            color: '#00eecc',
            nodeName: 'k8s-18-node02(192.168.32.64)',
            status: 'online',
            image: 'mqtt-broker:latest',
            cpu: 2.97,
            memoryUsed: 9.9,
            memoryTotal: 128,
            ioUp: 8.6,
            ioDown: 7.2,
            runTime: '9小时21分',
            restartCount: 1,
            latestLog: 'TCP通信链路正常，消息收发稳定，上次重启为节点资源调度切换'
          },
          {
            id: 'sat-03',
            name: '导航卫星',
            color: '#0066ff',
            nodeName: 'k8s-18-node03(192.168.251.31)',
            status: 'online',
            image: 'edge-location:v1.2',
            cpu: 32.7,
            memoryUsed: 89.6,
            memoryTotal: 512,
            ioUp: 4.1,
            ioDown: 3.5,
            runTime: '9小时21分',
            restartCount: 0,
            latestLog: '定位算法运行平稳，卫星坐标解算正常，在线连接数18'
          },
          {
            id: 'sat-04',
            name: '科研卫星',
            color: '#ffcc00',
            nodeName: 'k8s-18-node01(192.168.32.12)',
            status: 'online',
            image: 'ai-model:v3.1',
            cpu: 18.5,
            memoryUsed: 32.4,
            memoryTotal: 256,
            ioUp: 0.8,
            ioDown: 0.6,
            runTime: '1小时05分',
            restartCount: 0,
            latestLog: '热备待命状态，AI推理模型加载完成，可随时执行算力任务切换'
          }
        ]
      }
    }
  },
  emits: ['clickSat'],
  data() {
    return {
      activeSat: null,
      tooltipPos: { left: '0px', top: '0px' },
      tooltipHover: false,
      closeTimer: null
    }
  },
  mounted() {
    // 挂载全局鼠标移动监听，实时判定鼠标区域
    document.addEventListener('mousemove', this.globalMouseMove)
  },
  beforeUnmount() {
    // 组件销毁移除全局监听，防止内存泄漏
    document.removeEventListener('mousemove', this.globalMouseMove)
    this.clearTimer()
  },
  computed: {
    cpuPoints() {
      if (!this.activeSat) return ''
      const baseVal = this.activeSat.cpu
      const pointArr = []
      const width = 320
      const height = 50
      for (let i = 0; i <= 15; i++) {
        const x = (width / 15) * i
        const random = (Math.random() - 0.5) * 12
        const cpu = Math.max(0, Math.min(100, baseVal + random))
        const y = height - (cpu / 100) * height
        pointArr.push(`${x},${y}`)
      }
      return pointArr.join(' ')
    },
    cpuAreaPoints() {
      if (!this.activeSat) return ''
      const linePoints = this.cpuPoints
      const lastX = 320
      return linePoints + ` ${lastX},50 0,50`
    }
  },
  methods: {
    // 全局鼠标实时检测
    globalMouseMove(e) {
      if (!this.activeSat) return
      const panelDom = this.$refs.panelRef
      const tipDom = this.$refs.tooltipRef
      if (!panelDom || !tipDom) return

      const panelRect = panelDom.getBoundingClientRect()
      const tipRect = tipDom.getBoundingClientRect()
      const mouseX = e.clientX
      const mouseY = e.clientY

      // 判断鼠标是否在【面板区域】 或者 【弹窗区域】
      const inPanel = (
        mouseX >= panelRect.left && mouseX <= panelRect.right &&
        mouseY >= panelRect.top && mouseY <= panelRect.bottom
      )
      const inTooltip = (
        mouseX >= tipRect.left && mouseX <= tipRect.right &&
        mouseY >= tipRect.top && mouseY <= tipRect.bottom
      )

      // 完全离开两块区域，立刻关闭弹窗
      if (!inPanel && !inTooltip) {
        this.activeSat = null
        this.tooltipHover = false
      }
    },
    handleEnter(sat) {
      this.clearTimer()
      this.activeSat = sat
      this.$nextTick(() => {
        this.setTooltipPos()
      })
    },
    handleSatLeave() {
      this.clearTimer()
      this.closeTimer = setTimeout(() => {
        // 延时仅做兜底，全局mousemove优先控制关闭
        if (!this.tooltipHover) {
          this.activeSat = null
        }
      }, 180)
    },
    clearTimer() {
      if (this.closeTimer) {
        clearTimeout(this.closeTimer)
        this.closeTimer = null
      }
    },
    setTooltipPos() {
      const panelDom = this.$refs.panelRef
      if (!panelDom) return
      const panelRect = panelDom.getBoundingClientRect()
      const tipWidth = 360
      let leftPx = panelRect.width + 14
      let topPx = 0
      if (panelRect.right + tipWidth > window.innerWidth) {
        leftPx = -tipWidth - 14
      }
      const tipHeight = 420
      if (panelRect.top + topPx + tipHeight > window.innerHeight) {
        topPx = window.innerHeight - panelRect.bottom - tipHeight - 20
      }
      this.tooltipPos = {
        left: `${leftPx}px`,
        top: `${topPx}px`
      }
    }
  }
}
</script>

<style scoped>
.sat-panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-family: 'Courier New', monospace;
  position: relative;
  overflow: visible !important;
}

.panel-header {
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(0, 255, 255, 0.12);
  flex-shrink: 0;
}

.title {
  font-size: 15px;
  font-weight: 600;
  color: #00ffff;
  letter-spacing: 1px;
  text-shadow: 0 0 10px rgba(0, 255, 255, 0.25);
}

.header-line {
  width: 40px;
  height: 2px;
  margin-top: 6px;
  background: linear-gradient(90deg, #00ffff, transparent);
  box-shadow: 0 0 12px rgba(0, 255, 255, 0.25);
}

.sat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 10px;
  flex: 1;
  overflow: hidden;
}

.sat-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 10px;
  border-radius: 8px;
  border: 1px solid rgba(0, 255, 255, 0.1);
  cursor: pointer;
  transition: all 0.25s ease;
  background: rgba(0, 255, 255, 0.03);
}
.sat-item:hover {
  border-color: rgba(0, 255, 255, 0.28);
  background: rgba(0, 255, 255, 0.08);
  box-shadow: 0 0 15px rgba(0, 255, 255, 0.12);
}

.status-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 8px currentColor;
}

.sat-main {
  flex: 1;
  overflow: hidden;
}
.sat-name {
  font-size: 13px;
  color: #fff;
  letter-spacing: 0.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sat-node {
  font-size: 10px;
  color: rgba(0, 255, 255, 0.55);
  margin-top: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status-tag {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}
.online {
  color: #00ff99;
  border: 1px solid rgba(0, 255, 153, 0.3);
}
.offline {
  color: #ff5555;
  border: 1px solid rgba(255, 85, 85, 0.3);
}

.sat-tooltip {
  position: absolute;
  width: 360px;
  background: rgba(12, 16, 28, 0.96);
  border: 1px solid rgba(0, 255, 255, 0.22);
  border-radius: 8px;
  padding: 16px;
  z-index: 999999;
  box-shadow: 0 0 25px rgba(0, 255, 255, 0.18);
  backdrop-filter: blur(12px);
}

.tip-title {
  font-size: 14px;
  color: #00ffff;
  font-weight: 600;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(0, 255, 255, 0.15);
  margin-bottom: 12px;
}

.tip-row {
  display: flex;
  font-size: 12px;
  line-height: 24px;
}
.label {
  width: 90px;
  color: rgba(0, 255, 255, 0.65);
  flex-shrink: 0;
}
.value {
  flex: 1;
  color: #fff;
}

.cpu-chart-wrap {
  margin: 10px 0;
  padding: 8px;
  background: rgba(0, 255, 255, 0.04);
  border-radius: 6px;
}

.log-wrap {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed rgba(0, 255, 255, 0.12);
}
.log-title {
  font-size: 12px;
  color: rgba(0, 255, 255, 0.65);
  margin-bottom: 4px;
}
.log-content {
  font-size: 11px;
  color: #ccc;
  line-height: 1.6;
}
</style>