import { createRouter, createWebHistory } from 'vue-router'
import SatelliteTask from '../views/satelliteTask/index.vue'

const routes = [
  {
    path: '/',
    name: 'SatelliteTask',
    component: SatelliteTask
  },
  // ---- 开发调试路由（星座分组任务临时路由，项目负责人合并时决定是否保留） ----
  {
    path: '/dev/constellation-groups',
    name: 'ConstellationGroupDemo',
    component: () => import('../views/dev/ConstellationGroupDemo.vue')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
