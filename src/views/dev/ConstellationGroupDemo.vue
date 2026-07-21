<!--
  星座分组配置 — 独立 Demo 测试页面（第三阶段：挂载真实组件）

  用途：
    - 挂载真实的 ConstellationGroupManager 组件
    - 调用真实后端接口（查询、编辑、移动、删除等）
    - 展示选中星座 ID 供验证
    - 保留原始 JSON 展示在折叠区域供调试

  访问地址：/dev/constellation-groups
-->

<template>
  <div class="demo-wrap">
    <!-- 顶部标题栏 -->
    <header class="demo-header">
      <h1>星座分组配置 · 功能测试</h1>
      <span class="sub">Dev Panel — /dev/constellation-groups</span>
    </header>

    <!-- 当前选中星座 ID（供验证对外暴露接口） -->
    <div class="selected-info">
      <span class="info-label">当前选中 constellation_id：</span>
      <code class="info-value">{{ selectedGroupId || '(无)' }}</code>
    </div>

    <!-- 挂载真实组件 -->
    <div class="manager-wrapper">
      <ConstellationGroupManager
        ref="managerRef"
        @select-constellation="onSelectConstellation"
      />
    </div>

    <!-- 原始 JSON 调试区（默认折叠） -->
    <details class="debug-json">
      <summary>调试：原始后端数据 JSON</summary>
      <div class="meta-bar">
        <span>版本：{{ store.state.version }}</span>
        <span>来源：{{ store.state.source }}</span>
        <span>分组数：{{ store.state.groups.length }}</span>
        <span>未分配：{{ store.state.unassignedCount }}</span>
        <button class="btn-refresh" :disabled="store.state.loading" @click="refreshData">
          {{ store.state.loading ? '刷新中...' : '刷新数据' }}
        </button>
      </div>
      <pre>{{ JSON.stringify(store.state.groups, null, 2) }}</pre>
      <pre>{{ JSON.stringify(store.state.unassigned, null, 2) }}</pre>
    </details>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue'
import { useConstellationGroupStore } from '@/store/constellationGroupStore'
import ConstellationGroupManager from '@/components/constellation/ConstellationGroupManager.vue'

export default {
  name: 'ConstellationGroupDemo',
  components: { ConstellationGroupManager },
  setup() {
    const store = useConstellationGroupStore()
    const managerRef = ref(null)
    const selectedGroupId = ref(null)

    /** 选中星座变化时的回调 */
    function onSelectConstellation(id) {
      selectedGroupId.value = id
    }

    /** 手动刷新数据 */
    async function refreshData() {
      try {
        await store.fetchGroups()
      } catch (_) {
        // 错误已由 store 管理
      }
    }

    // 页面挂载时确保数据已加载
    onMounted(() => {
      if (!store.state.groups.length && !store.state.loading) {
        refreshData()
      }
    })

    return {
      store,
      managerRef,
      selectedGroupId,
      onSelectConstellation,
      refreshData
    }
  }
}
</script>

<style scoped>
/* =========================================================================
   深色科技风主题
   ========================================================================= */

.demo-wrap {
  width: 100vw;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  color: #eaffff;
  background:
    radial-gradient(circle at 50% 35%, rgba(56, 255, 183, .08), transparent 32%),
    radial-gradient(circle at 72% 62%, rgba(82, 196, 255, .07), transparent 28%),
    linear-gradient(135deg, #010309, #02111a 52%, #010309);
  font-family: 'Microsoft YaHei', 'PingFang SC', Avenir, Helvetica, Arial, sans-serif;
  overflow: hidden;
}

/* ---- 顶部标题栏 ---- */
.demo-header {
  display: flex;
  align-items: baseline;
  gap: 16px;
  padding: 14px 20px;
  border-bottom: 1px solid rgba(56, 255, 183, .12);
  flex-shrink: 0;
}

.demo-header h1 {
  color: #fff;
  font-size: 18px;
}

.demo-header .sub {
  color: rgba(201, 255, 247, .42);
  font-size: 11px;
}

/* ---- 选中星座信息栏 ---- */
.selected-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 20px;
  background: rgba(2, 18, 28, .5);
  border-bottom: 1px solid rgba(82, 196, 255, .08);
  flex-shrink: 0;
  font-size: 12px;
}

.info-label {
  color: rgba(226, 255, 251, .55);
}

.info-value {
  color: #38ffb7;
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 12px;
  padding: 2px 8px;
  background: rgba(56, 255, 183, .08);
  border: 1px solid rgba(56, 255, 183, .16);
  border-radius: 3px;
}

/* ---- 组件容器 ---- */
.manager-wrapper {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  border-bottom: 1px solid rgba(82, 196, 255, .08);
}

/* ---- 调试 JSON（折叠） ---- */
.debug-json {
  flex-shrink: 0;
  background: rgba(2, 14, 22, .6);
  border-top: 1px solid rgba(82, 196, 255, .08);
}

.debug-json summary {
  padding: 6px 20px;
  color: rgba(82, 196, 255, .5);
  font-size: 11px;
  cursor: pointer;
  user-select: none;
}

.debug-json summary:hover {
  color: rgba(82, 196, 255, .8);
}

.meta-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 6px 20px;
  font-size: 11px;
  color: rgba(201, 255, 247, .5);
}

.btn-refresh {
  margin-left: auto;
  padding: 4px 10px;
  color: #041015;
  background: linear-gradient(135deg, #38ffb7, #52c4ff);
  border: 1px solid rgba(56, 255, 183, .7);
  border-radius: 4px;
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  font-weight: 600;
}

.btn-refresh:disabled {
  opacity: .5;
  cursor: wait;
}

.debug-json pre {
  padding: 8px 20px 12px;
  margin: 0;
  color: rgba(226, 255, 251, .5);
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 11px;
  line-height: 1.5;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 200px;
  overflow-y: auto;
}
</style>
