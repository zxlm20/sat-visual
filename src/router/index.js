import { createRouter, createWebHistory } from 'vue-router'
import LoadBalancingDemo from '../views/dev/LoadBalancingDemo.vue'
import SatelliteTask from '../views/satelliteTask/index.vue'

const routes = [
  {
    path: '/',
    name: 'SatelliteTask',
    component: SatelliteTask
  },
  {
    path: '/dev/load-balancing',
    name: 'LoadBalancingDemo',
    component: LoadBalancingDemo
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
