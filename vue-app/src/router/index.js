import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
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
      path: '/games',
      name: 'games',
      component: () => import('../views/GamesView.vue'),
    },
    {
      path: '/wordle/:hash?',
      name: 'wordle',
      component: () => import('../views/WordleView.vue'),
      meta: { hideAppBar: true },
    },
    {
      path: '/wordle-helper',
      name: 'wordle-helper',
      component: () => import('../views/WordleHelperView.vue'),
    },
    {
      path: '/gradient-sort',
      name: 'gradient-sort',
      component: () => import('../views/GradientSortView.vue'),
    },
    {
      path: '/time-since',
      name: 'time-since',
      component: () => import('../views/TimeSinceView.vue'),
    },
    {
      path: '/gallery',
      name: 'gallery',
      component: () => import('../views/GalleryView.vue'),
    },
  ],
})

export default router
