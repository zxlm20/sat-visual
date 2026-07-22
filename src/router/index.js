import { createRouter, createWebHistory } from 'vue-router'
import SatelliteTask from '../views/satelliteTask/index.vue'

const routes = [
  {
    path: '/',
    name: 'SatelliteTask',
    component: SatelliteTask
  },
  {
    path: '/dev/dynamic-topology',
    name: 'DynamicTopologyDemo',
    component: () => import('../views/dev/DynamicTopologyDemo.vue')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
