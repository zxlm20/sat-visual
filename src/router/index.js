import { createRouter, createWebHistory } from 'vue-router'
import SatelliteTask from '../views/satelliteTask/index.vue'
import LinkStateDemo from '../views/dev/LinkStateDemo.vue'

const routes = [
  {
    path: '/',
    name: 'SatelliteTask',
    component: SatelliteTask
  },
  {
    path: '/dev/link-state',
    name: 'LinkStateDemo',
    component: LinkStateDemo
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
