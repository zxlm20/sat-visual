import { createRouter, createWebHistory } from 'vue-router'
import SatelliteTask from '../views/satelliteTask/index.vue'

const routes = [
  {
    path: '/',
    name: 'SatelliteTask',
    component: SatelliteTask
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
