import { createRouter, createWebHistory } from 'vue-router'

const DEFAULT_TITLE = 'David Morley — Applied Research Scientist'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  // /work#salt etc. land on the case study, clear of the fixed app bar;
  // back/forward restores the old position; a game rewriting its seed in the
  // URL (same route, new params) keeps the scroll; everything else starts at
  // the top.
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.hash) return { el: to.hash, top: 80 }
    if (to.name === from.name && to.path !== from.path) return false
    return { top: 0 }
  },
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/HomeView.vue'),
    },
    {
      path: '/work',
      name: 'work',
      component: () => import('../views/WorkView.vue'),
      meta: { title: 'Work' },
    },
    {
      path: '/about',
      name: 'about',
      component: () => import('../views/AboutView.vue'),
      meta: { title: 'About' },
    },
    // Old links to /contact keep working.
    { path: '/contact', redirect: { name: 'about' } },
    {
      path: '/games',
      name: 'games',
      component: () => import('../views/GamesView.vue'),
      meta: { title: 'Playground' },
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
      path: '/tango/:seed?',
      name: 'tango',
      component: () => import('../views/TangoView.vue'),
      meta: { gamePage: true, lockScroll: true },
    },
    {
      path: '/nerdle/:seed?',
      name: 'nerdle',
      component: () => import('../views/NerdleView.vue'),
      meta: { gamePage: true, lockScroll: true },
    },
    {
      path: '/simon',
      name: 'simon',
      component: () => import('../views/SimonView.vue'),
      meta: { gamePage: true, lockScroll: true },
    },
    {
      path: '/memory',
      name: 'memory',
      component: () => import('../views/MemoryView.vue'),
      meta: { gamePage: true, lockScroll: true },
    },
    {
      path: '/connect-4',
      name: 'connect-4',
      component: () => import('../views/Connect4View.vue'),
      meta: { gamePage: true, lockScroll: true },
    },
    {
      path: '/color-memory',
      name: 'color-memory',
      component: () => import('../views/ColorMemoryView.vue'),
      meta: { gamePage: true, lockScroll: true },
    },
    {
      path: '/tunnel',
      name: 'tunnel',
      component: () => import('../views/TunnelView.vue'),
      meta: { gamePage: true, lockScroll: true },
    },
    {
      path: '/ninja-climb',
      name: 'ninja-climb',
      component: () => import('../views/WallJumpView.vue'),
      meta: { gamePage: true, lockScroll: true },
    },
    {
      path: '/ball-bounce',
      name: 'ball-bounce',
      component: () => import('../views/BallBounceView.vue'),
      meta: { gamePage: true, lockScroll: true },
    },
    {
      path: '/count-blocks',
      name: 'count-blocks',
      component: () => import('../views/CountBlocksView.vue'),
      meta: { gamePage: true, lockScroll: true },
    },
    {
      path: '/mini-golf/:seed?',
      name: 'mini-golf',
      component: () => import('../views/MiniGolfView.vue'),
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

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · David Morley` : DEFAULT_TITLE
})

export default router
