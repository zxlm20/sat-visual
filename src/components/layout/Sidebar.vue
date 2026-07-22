<template>
  <aside
    class="sidebar"
    :class="{ expanded: isHover }"
    @mouseenter="isHover = true"
    @mouseleave="isHover = false"
  >
    <div class="rail-head">
      <span class="brand-mark">SV</span>
      <div class="brand-copy">
        <strong>星网控制台</strong>
        <span>空间态势监控</span>
      </div>
    </div>

    <nav class="menu-list">
      <button
        v-for="item in menus"
        :key="item.id"
        class="menu-item"
        :class="{ active: active === item.id }"
        type="button"
        @click="selectMenu(item)"
      >
        <span class="icon">{{ item.icon }}</span>
        <span class="menu-copy">
          <span class="label">{{ item.name }}</span>
          <span class="desc">{{ item.desc }}</span>
        </span>
        <span class="status" :class="item.status">{{ statusText[item.status] }}</span>
      </button>
    </nav>

    <div class="rail-foot">
      <span class="pulse"></span>
      <span class="foot-copy">数据链路在线</span>
    </div>
  </aside>
</template>

<script>
import { ref } from 'vue'

export default {
  name: 'Sidebar',
  emits: ['menu-change'],
  setup(props, { emit }) {
    const isHover = ref(false)
    const active = ref(null)

    const statusText = {
      ready: '就绪',
      beta: '预览',
      live: '实时'
    }

    const menus = [
      { id: 'constellation', icon: '星', name: '星座配置', desc: '轨道层与星座模板', status: 'ready' },
      { id: 'ephemeris', icon: '历', name: '星历加载', desc: 'TLE / 星历文件导入', status: 'ready' },
      { id: 'node', icon: '网', name: '网络节点目录', desc: '卫星与地面站清单', status: 'live' },
      { id: 'tasks', icon: '任', name: '任务查询', desc: '历史任务与切片明细', status: 'live' },
      { id: 'business', icon: '业', name: '业务类型', desc: '任务流与链路承载', status: 'beta' },
      { id: 'physical', icon: '实', name: '半物理节点', desc: '真实设备接入配置', status: 'beta' },
      { id: 'balance', icon: '衡', name: '负载均衡', desc: '调度策略与权重', status: 'ready' },
      { id: 'topology', icon: '拓', name: '网络拓扑', desc: '动态链路与拥塞状态', status: 'ready' }
    ]

    const selectMenu = (item) => {
      active.value = item.id
      emit('menu-change', item)
    }

    return {
      isHover,
      menus,
      active,
      statusText,
      selectMenu
    }
  }
}
</script>

<style scoped>
.sidebar {
  position: fixed;
  left: 20px;
  top: 50%;
  z-index: 20;
  width: 72px;
  height: min(734px, calc(100vh - 72px));
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transform: translateY(-50%);
  color: #eaffff;
  background:
    linear-gradient(180deg, rgba(5, 27, 36, .9), rgba(2, 9, 18, .82)),
    radial-gradient(circle at 25% 0, rgba(56, 255, 183, .2), transparent 34%);
  border: 1px solid rgba(89, 216, 255, .32);
  border-radius: 8px;
  box-shadow:
    0 20px 52px rgba(0, 0, 0, .42),
    inset 0 0 28px rgba(56, 255, 183, .05);
  backdrop-filter: blur(14px);
  font-family: 'Microsoft YaHei', 'PingFang SC', Arial, sans-serif;
  transition: width .26s ease, border-color .26s ease, box-shadow .26s ease;
}

.sidebar::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(90deg, rgba(56, 255, 183, .18), transparent 26%),
    repeating-linear-gradient(0deg, rgba(255, 255, 255, .035) 0, rgba(255, 255, 255, .035) 1px, transparent 1px, transparent 8px);
  opacity: .42;
}

.sidebar::after {
  content: '';
  position: absolute;
  top: 70px;
  bottom: 70px;
  left: 71px;
  width: 1px;
  background: linear-gradient(180deg, transparent, rgba(56, 255, 183, .65), transparent);
  opacity: 0;
  transition: opacity .2s ease;
}

.sidebar.expanded {
  width: 300px;
  border-color: rgba(56, 255, 183, .5);
  box-shadow:
    0 22px 62px rgba(0, 0, 0, .48),
    0 0 30px rgba(56, 255, 183, .14);
}

.sidebar.expanded::after {
  opacity: 1;
}

.rail-head,
.rail-foot,
.menu-list {
  position: relative;
  z-index: 1;
}

.rail-head {
  height: 60px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 5px 12px;
  border-bottom: 1px solid rgba(89, 216, 255, .2);
  flex-shrink: 0;
}

.brand-mark {
  width: 46px;
  height: 40px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: #031116;
  background: linear-gradient(135deg, #38ffb7, #52c4ff);
  border-radius: 6px;
  font-size: 14px;
  font-weight: 800;
  box-shadow: 0 0 18px rgba(56, 255, 183, .28);
}

.brand-copy,
.menu-copy,
.status,
.foot-copy {
  opacity: 0;
  transform: translateX(-10px);
  transition: .22s ease;
  white-space: nowrap;
}

.sidebar.expanded .brand-copy,
.sidebar.expanded .menu-copy,
.sidebar.expanded .status,
.sidebar.expanded .foot-copy {
  opacity: 1;
  transform: translateX(0);
}

.brand-copy strong {
  display: block;
  color: #fff;
  font-size: 15px;
}

.brand-copy span {
  display: block;
  margin-top: 3px;
  color: rgba(201, 255, 247, .6);
  font-size: 11px;
}

.menu-list {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 7px;
  padding: 14px 0;
}

.menu-item {
  width: 282px;
  min-height: 56px;
  display: grid;
  grid-template-columns: 54px 1fr auto;
  align-items: center;
  gap: 8px;
  padding: 0 10px 0 0;
  color: #d7fffb;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 7px;
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition: background .18s ease, border-color .18s ease, transform .18s ease;
}

.menu-item:hover,
.menu-item.active {
  background: linear-gradient(90deg, rgba(56, 255, 183, .15), rgba(82, 196, 255, .07));
  border-color: rgba(56, 255, 183, .34);
}

.menu-item:hover {
  transform: translateX(2px);
}

.menu-item.active {
  box-shadow: inset 3px 0 0 #38ffb7, 0 0 18px rgba(56, 255, 183, .12);
}

.icon {
  width: 54px;
  height: 56px;
  display: grid;
  place-items: center;
  color: #38ffb7;
  font-size: 16px;
  font-weight: 700;
}

.label {
  display: block;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
}

.desc {
  display: block;
  margin-top: 4px;
  color: rgba(201, 255, 247, .58);
  font-size: 11px;
  line-height: 1;
}

.status {
  padding: 2px 6px;
  color: rgba(255, 255, 255, .8);
  background: rgba(255, 255, 255, .05);
  border: 1px solid rgba(255, 255, 255, .14);
  border-radius: 4px;
  font-size: 11px;
}

.status.live {
  color: #38ffb7;
  border-color: rgba(56, 255, 183, .34);
}

.status.beta {
  color: #ffd86b;
  border-color: rgba(255, 216, 107, .34);
}

.rail-foot {
  height: 44px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  flex-shrink: 0;
  color: rgba(201, 255, 247, .72);
  border-top: 1px solid rgba(89, 216, 255, .2);
  font-size: 12px;
}

.pulse {
  width: 9px;
  height: 9px;
  flex-shrink: 0;
  border-radius: 50%;
  background: #38ffb7;
  box-shadow: 0 0 14px rgba(56, 255, 183, .85);
  animation: pulse 1.6s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: .6;
    transform: scale(.78);
  }

  50% {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
