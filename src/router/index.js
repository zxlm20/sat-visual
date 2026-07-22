import { createRouter, createWebHistory } from 'vue-router'
import SatelliteTask from '../views/satelliteTask/index.vue'

const routes = [
  {
    path: '/',
    name: 'SatelliteTask',
    component: SatelliteTask
  },
  // 独立功能验收路由，正式接入主界面后可按需移除。
  {
    path: '/dev/constellation-groups',
    name: 'ConstellationGroupDemo',
    component: () => import('../views/dev/ConstellationGroupDemo.vue')
  },
  {
    path: '/dev/load-balancing',
    name: 'LoadBalancingDemo',
    component: () => import('../views/dev/LoadBalancingDemo.vue')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
