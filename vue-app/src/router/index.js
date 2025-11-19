import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory('https://morleyd.github.io/'),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/HomeView.vue'),
    },
    {
      path: '/contact',
      name: 'contact',
      component: () => import('../views/ContactView.vue'),
    },
    {
      path: '/wordle/:hash?',
      name: 'wordle',
      component: () => import('../views/WordleView.vue'),
    },
    {
      path: '/time-since',
      name: 'time-since',
      component: () => import('../views/TimeSinceView.vue'),
    },
  ],
})

export default router
