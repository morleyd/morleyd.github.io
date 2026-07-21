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
      meta: { gamePage: true },
    },
    {
      path: '/wordle-helper',
      name: 'wordle-helper',
      component: () => import('../views/WordleHelperView.vue'),
      meta: { gamePage: true },
    },
    {
      path: '/gradient-sort/:seed?',
      name: 'gradient-sort',
      component: () => import('../views/GradientSortView.vue'),
      meta: { gamePage: true, lockScroll: true },
    },
    {
      path: '/2048',
      name: '2048',
      component: () => import('../views/Game2048View.vue'),
      meta: { gamePage: true, lockScroll: true },
    },
    {
      path: '/tetris',
      name: 'tetris',
      component: () => import('../views/TetrisView.vue'),
      meta: { gamePage: true, lockScroll: true },
    },
    {
      path: '/snake',
      name: 'snake',
      component: () => import('../views/SnakeView.vue'),
      meta: { gamePage: true, lockScroll: true },
    },
    {
      path: '/minesweeper/:seed?',
      name: 'minesweeper',
      component: () => import('../views/MinesweeperView.vue'),
      meta: { gamePage: true, lockScroll: true },
    },
    {
      path: '/lights-out/:seed?',
      name: 'lights-out',
      component: () => import('../views/LightsOutView.vue'),
      meta: { gamePage: true, lockScroll: true },
    },
    {
      path: '/flood-it/:seed?',
      name: 'flood-it',
      component: () => import('../views/FloodItView.vue'),
      meta: { gamePage: true, lockScroll: true },
    },
    {
      path: '/sudoku/:seed?',
      name: 'sudoku',
      component: () => import('../views/SudokuView.vue'),
      meta: { gamePage: true, lockScroll: true },
    },
    {
      path: '/nonogram/:seed?',
      name: 'nonogram',
      component: () => import('../views/NonogramView.vue'),
      meta: { gamePage: true, lockScroll: true },
    },
    {
      path: '/wizard-chess/:seed?',
      name: 'wizard-chess',
      component: () => import('../views/WizardChessView.vue'),
      meta: { gamePage: true },
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
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('../views/NotFoundView.vue'),
    },
  ],
})

export default router
