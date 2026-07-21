<!--
  星座分组配置 — 独立 Demo 测试页面（第二阶段：原始数据展示）

  用途：
    - 挂载星座分组 Store，调用真实后端接口
    - 页面加载时 fetchGroups() 获取数据
    - 将返回的原始 JSON 格式化展示
    - 展示加载中、错误、空数据等状态

  访问地址：/dev/constellation-groups
  接口依赖：GET /api/constellations/groups（通过 constellationGroupStore.fetchGroups()）
-->
<template>
  <div class="demo-wrap">
    <!-- 顶部标题栏 -->
    <header class="demo-header">
      <h1>星座分组配置 · 接口调试</h1>
      <span class="sub">Dev Panel — /dev/constellation-groups</span>
    </header>

    <!-- 加载状态 -->
    <section v-if="store.state.loading" class="state-card">
      <div class="spinner"></div>
      <p>正在请求星座分组数据...</p>
    </section>

    <!-- 错误状态 -->
    <section v-else-if="store.state.error" class="state-card error">
      <div class="state-icon">⚠️</div>
      <h2>请求失败</h2>
      <p class="err-msg">{{ store.state.error }}</p>
      <button class="btn-retry" @click="loadData">重新请求</button>
    </section>

    <!-- 空数据状态 -->
    <section v-else-if="!store.state.groups.length && !store.state.unassigned.length" class="state-card empty">
      <div class="state-icon">📭</div>
      <h2>暂无星座分组数据</h2>
      <p>后端返回的 groups 和 unassigned 均为空，请确认已配置星座分组。</p>
      <button class="btn-retry" @click="loadData">刷新</button>
    </section>

    <!-- 数据展示 -->
    <section v-else class="data-section">
      <!-- 元信息 -->
      <div class="meta-bar">
        <span>版本：{{ store.state.version }}</span>
        <span>来源：{{ store.state.source }}</span>
        <span>分组数：{{ store.state.groups.length }}</span>
        <span>未分配：{{ store.state.unassignedCount }}</span>
        <button class="btn-refresh" :disabled="store.state.loading" @click="loadData">
          {{ store.state.loading ? '刷新中...' : '刷新数据' }}
        </button>
      </div>

      <!-- groups 原始 JSON -->
      <details class="json-block" open>
        <summary>groups（星座分组列表 · {{ store.state.groups.length }} 个）</summary>
        <pre>{{ JSON.stringify(store.state.groups, null, 2) }}</pre>
      </details>

      <!-- unassigned 原始 JSON -->
      <details class="json-block" open>
        <summary>unassigned（未分配卫星 · {{ store.state.unassignedCount }} 个）</summary>
        <pre>{{ JSON.stringify(store.state.unassigned, null, 2) }}</pre>
      </details>

      <!-- 完整原始响应 -->
      <details class="json-block">
        <summary>完整原始响应</summary>
        <pre>{{
          JSON.stringify(
            {
              version: store.state.version,
              updated_at: store.state.updatedAt,
              groups: store.state.groups,
              unassigned: store.state.unassigned,
              unassigned_count: store.state.unassignedCount,
              source: store.state.source,
              note: store.state.note,
            },
            null,
            2
          )
        }}</pre>
      </details>
    </section>
  </div>
</template>

<script>
import { onMounted } from 'vue'
import { useConstellationGroupStore } from '@/store/constellationGroupStore'

export default {
  name: 'ConstellationGroupDemo',
  setup() {
    const store = useConstellationGroupStore()

    /** 加载星座分组数据 */
    async function loadData() {
      try {
        await store.fetchGroups()
      } catch (_) {
        // 错误信息已由 store 管理，通过 store.state.error 展示
      }
    }

    // 页面挂载时自动请求数据
    onMounted(() => {
      loadData()
    })

    return { store, loadData }
  }
}
</script>

<style scoped>
/* =========================================================================
   深色科技风主题，参照 src/App.vue 和 src/views/satelliteTask/index.vue 风格
   ========================================================================= */

.demo-wrap {
  width: 100vw;
  min-height: 100vh;
  padding: 28px 32px;
  color: #eaffff;
  background:
    radial-gradient(circle at 50% 35%, rgba(56, 255, 183, .08), transparent 32%),
    radial-gradient(circle at 72% 62%, rgba(82, 196, 255, .07), transparent 28%),
    linear-gradient(135deg, #010309, #02111a 52%, #010309);
  font-family: 'Microsoft YaHei', 'PingFang SC', Avenir, Helvetica, Arial, sans-serif;
  overflow-y: auto;
}

/* ---- 顶部标题栏 ---- */
.demo-header {
  display: flex;
  align-items: baseline;
  gap: 16px;
  margin-bottom: 24px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(56, 255, 183, .18);
}

.demo-header h1 {
  color: #fff;
  font-size: 22px;
}

.demo-header .sub {
  color: rgba(201, 255, 247, .48);
  font-size: 12px;
}

/* ---- 状态卡片 ---- */
.state-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 48px 24px;
  margin-top: 20px;
  background: rgba(4, 24, 32, .48);
  border: 1px solid rgba(82, 196, 255, .16);
  border-radius: 8px;
  text-align: center;
}

.state-card h2 {
  color: #fff;
  font-size: 18px;
}

.state-card p {
  color: rgba(226, 255, 251, .66);
  max-width: 520px;
  line-height: 1.7;
}

.state-card.error {
  border-color: rgba(255, 90, 90, .36);
  background: rgba(24, 8, 8, .48);
}

.state-card.error h2 {
  color: #ff7a7a;
}

.err-msg {
  color: #ffbbbb !important;
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 13px;
  word-break: break-all;
}

.state-card.empty {
  border-color: rgba(255, 184, 77, .28);
  background: rgba(24, 18, 4, .48);
}

.state-card.empty h2 {
  color: #ffcf74;
}

.state-icon {
  font-size: 36px;
}

/* ---- 加载动画 ---- */
.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid rgba(56, 255, 183, .18);
  border-top-color: #38ffb7;
  border-radius: 50%;
  animation: spin .8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ---- 按钮 ---- */
.btn-retry,
.btn-refresh {
  padding: 8px 20px;
  color: #041015;
  background: linear-gradient(135deg, #38ffb7, #52c4ff);
  border: 1px solid rgba(56, 255, 183, .7);
  border-radius: 6px;
  cursor: pointer;
  font: inherit;
  font-weight: 700;
  font-size: 13px;
}

.btn-retry:hover,
.btn-refresh:hover {
  box-shadow: 0 0 16px rgba(56, 255, 183, .28);
}

.btn-refresh:disabled {
  opacity: .5;
  cursor: wait;
}

/* ---- 元信息栏 ---- */
.meta-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  margin-bottom: 18px;
  padding: 10px 16px;
  background: rgba(2, 18, 28, .58);
  border: 1px solid rgba(82, 196, 255, .18);
  border-radius: 6px;
  font-size: 12px;
  color: rgba(201, 255, 247, .68);
}

.meta-bar .btn-refresh {
  margin-left: auto;
}

/* ---- JSON 展示区域 ---- */
.data-section {
  margin-top: 8px;
}

.json-block {
  margin-bottom: 14px;
  background: rgba(2, 14, 22, .68);
  border: 1px solid rgba(82, 196, 255, .14);
  border-radius: 6px;
  overflow: hidden;
}

.json-block summary {
  padding: 10px 16px;
  color: #52c4ff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
  background: rgba(4, 24, 32, .42);
}

.json-block summary:hover {
  background: rgba(4, 24, 32, .64);
}

.json-block pre {
  padding: 16px;
  margin: 0;
  color: rgba(226, 255, 251, .82);
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.6;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 480px;
  overflow-y: auto;
}
</style>
