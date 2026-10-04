import { createRouter, createWebHistory } from 'vue-router'
import SmartPrintDashboard from '@/views/SmartPrintDashboard.vue'

const routes = [
  {
    path: '/',
    name: 'new',
    component: () => import('@/views/SmartPrintDesigner.vue'),
  },

  {
    path: '/dashboard',
    name: 'dashboard',
    component: SmartPrintDashboard,
  },
  {
    path: '/designer/:name',
    name: 'designer',
    component: () => import('@/views/SmartPrintDesigner.vue'),
    props: true,
  },
  {
    path: '/versions/:name',
    name: 'versions',
    component: () => import('@/views/SmartPrintVersions.vue'),
    props: true,
  },

  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory('/smart-print'),
  routes,
})

export default router
