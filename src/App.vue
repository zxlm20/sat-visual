<template>
  <div id="app">
    <router-view v-if="gateState === 'ready' || gateState === 'degraded'" />

    <aside
      v-if="gateState === 'degraded'"
      class="backend-offline-banner"
      role="status"
    >
      <span>
        <strong>后端暂不可用，已进入降级模式</strong>
        <small>{{ errorMessage }} · 正在自动重连 {{ apiBaseUrl }}</small>
      </span>
      <button type="button" :disabled="reconnecting" @click="retryBackend">
        {{ reconnecting ? '检查中...' : '立即重试' }}
      </button>
    </aside>

    <main
      v-if="gateState === 'checking'"
      class="health-gate"
    >
      <section class="health-panel">
        <div class="health-mark">
          <span></span>
        </div>

        <p class="eyebrow">VersionA 后端接入检查</p>
        <h1>{{ titleText }}</h1>
        <p class="message">{{ messageText }}</p>

        <div class="status-grid">
          <div>
            <span>接口地址</span>
            <strong>{{ apiBaseUrl }}</strong>
          </div>
          <div>
            <span>健康接口</span>
            <strong>/api/health</strong>
          </div>
          <div>
            <span>节点接口</span>
            <strong>/api/nodes</strong>
          </div>
          <div>
            <span>当前状态</span>
            <strong>{{ statusText }}</strong>
          </div>
        </div>

      </section>
    </main>
  </div>
</template>

<script>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { checkBackendHealth, getApiBaseUrl } from '@/api/backend'
import { useNodeStore } from '@/store/nodeStore'

export default {
  name: 'App',
  setup() {
    const gateState = ref('checking')
    const gateStep = ref('健康检查')
    const errorMessage = ref('')
    const reconnecting = ref(false)
    const apiBaseUrl = getApiBaseUrl()
    const { fetchNodes } = useNodeStore()
    let reconnectTimer = null

    const clearReconnectTimer = () => {
      if (!reconnectTimer) return
      window.clearTimeout(reconnectTimer)
      reconnectTimer = null
    }

    const startReconnectTimer = () => {
      if (reconnectTimer) return
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null
        retryBackend()
      }, 15000)
    }

    const enterDegradedMode = (error) => {
      gateState.value = 'degraded'
      errorMessage.value = error?.message || '后端接入失败'
      startReconnectTimer()
    }

    const checkCoreServices = async () => {
      const results = await Promise.allSettled([
        checkBackendHealth(),
        fetchNodes()
      ])
      const failures = results.filter((result) => result.status === 'rejected')
      if (failures.length) {
        const messages = [...new Set(failures.map((result) => (
          result.reason?.message || '后端接入失败'
        )))]
        throw new Error(messages.join('；'))
      }
    }

    const retryBackend = async () => {
      if (reconnecting.value) return
      reconnecting.value = true
      try {
        await checkCoreServices()
        clearReconnectTimer()
        errorMessage.value = ''
        // 重新载入一次，让星历、节点模型和资源轮询都从完整状态重新初始化。
        window.location.reload()
      } catch (error) {
        enterDegradedMode(error)
      } finally {
        reconnecting.value = false
      }
    }

    const bootstrap = async () => {
      gateState.value = 'checking'
      gateStep.value = '健康检查'
      errorMessage.value = ''

      try {
        gateStep.value = '检查后端与节点数据'
        await checkCoreServices()
        gateState.value = 'ready'
        clearReconnectTimer()
      } catch (err) {
        enterDegradedMode(err)
      }
    }

    const titleText = computed(() => (
      gateState.value === 'checking'
        ? `正在${gateStep.value}`
        : '后端暂不可用'
    ))

    const messageText = computed(() => (
      gateState.value === 'checking'
        ? '系统会先检查后端健康状态，再获取节点列表；完成后进入可视化界面。'
        : errorMessage.value
    ))

    const statusText = computed(() => (
      gateState.value === 'checking' ? gateStep.value : '降级运行'
    ))

    onMounted(bootstrap)
    onBeforeUnmount(clearReconnectTimer)

    return {
      gateState,
      apiBaseUrl,
      titleText,
      messageText,
      statusText,
      reconnecting,
      retryBackend
    }
  }
}
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

#app {
  width: 100%;
  height: 100vh;
  overflow: hidden;
  font-family: 'Microsoft YaHei', 'PingFang SC', Avenir, Helvetica, Arial, sans-serif;
}

.health-gate {
  width: 100vw;
  height: 100vh;
  display: grid;
  place-items: center;
  color: #eaffff;
  background:
    radial-gradient(circle at 50% 35%, rgba(56, 255, 183, .13), transparent 28%),
    radial-gradient(circle at 72% 62%, rgba(82, 196, 255, .11), transparent 24%),
    linear-gradient(135deg, #010309, #02111a 52%, #010309);
}

.health-panel {
  position: relative;
  width: min(590px, calc(100vw - 40px));
  padding: 30px;
  overflow: hidden;
  background: rgba(4, 24, 32, .84);
  border: 1px solid rgba(56, 255, 183, .36);
  border-radius: 8px;
  box-shadow: 0 24px 70px rgba(0, 0, 0, .5), 0 0 30px rgba(56, 255, 183, .12);
  backdrop-filter: blur(16px);
}

.health-panel::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(90deg, rgba(56, 255, 183, .08), transparent 22%),
    repeating-linear-gradient(0deg, rgba(255, 255, 255, .028) 0, rgba(255, 255, 255, .028) 1px, transparent 1px, transparent 8px);
}

.health-panel > * {
  position: relative;
  z-index: 1;
}

.health-mark {
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  margin-bottom: 18px;
  border: 1px solid rgba(56, 255, 183, .36);
  border-radius: 50%;
}

.health-mark span {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #38ffb7;
  box-shadow: 0 0 22px rgba(56, 255, 183, .85);
  animation: pulse 1.2s ease-in-out infinite;
}

.eyebrow {
  color: #38ffb7;
  font-size: 12px;
}

.health-panel h1 {
  margin-top: 6px;
  color: #fff;
  font-size: 26px;
}

.message {
  margin-top: 12px;
  color: rgba(226, 255, 251, .72);
  line-height: 1.7;
}

.status-grid {
  display: grid;
  gap: 10px;
  margin-top: 22px;
}

.status-grid div {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  padding: 11px 12px;
  background: rgba(2, 18, 28, .68);
  border: 1px solid rgba(82, 196, 255, .24);
  border-radius: 6px;
}

.status-grid span {
  color: rgba(201, 255, 247, .62);
}

.status-grid strong {
  color: #fff;
  font-size: 13px;
  text-align: right;
  word-break: break-all;
}

.health-panel button {
  width: 100%;
  height: 40px;
  margin-top: 18px;
  color: #041015;
  background: linear-gradient(135deg, #38ffb7, #52c4ff);
  border: 1px solid rgba(56, 255, 183, .7);
  border-radius: 6px;
  cursor: pointer;
  font: inherit;
  font-weight: 700;
}

.backend-offline-banner {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 10000;
  display: flex;
  align-items: center;
  gap: 16px;
  max-width: min(620px, calc(100vw - 36px));
  padding: 10px 12px 10px 14px;
  color: #fff4d8;
  background: rgba(41, 25, 4, .9);
  border: 1px solid rgba(255, 184, 77, .58);
  border-radius: 7px;
  box-shadow: 0 10px 34px rgba(0, 0, 0, .42);
  backdrop-filter: blur(12px);
}

.backend-offline-banner span {
  display: grid;
  min-width: 0;
}

.backend-offline-banner strong {
  color: #ffcf74;
  font-size: 13px;
}

.backend-offline-banner small {
  margin-top: 3px;
  overflow: hidden;
  color: rgba(255, 244, 216, .72);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.backend-offline-banner button {
  flex: 0 0 auto;
  padding: 7px 12px;
  color: #2c1900;
  background: #ffb84d;
  border: 0;
  border-radius: 5px;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
}

.backend-offline-banner button:disabled {
  cursor: wait;
  opacity: .6;
}

@keyframes pulse {
  0%,
  100% {
    opacity: .65;
    transform: scale(.8);
  }

  50% {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
