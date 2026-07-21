<script setup lang="ts">
/**
 * Mini Golf — a 9-hole seeded course. Drag anywhere and pull back to aim and set
 * power (like a slingshot), release to putt. Bounce off walls, sink the ball in
 * the cup in as few strokes as possible; score is total strokes vs par. Physics
 * and hole layouts come from services/miniGolf; the sim runs in fixed substeps
 * to avoid tunnelling through thin walls.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import GameToolbar from '@/components/GameToolbar.vue'
import { copyToClipboard } from '@/services/share'
import { randomSeed } from '@/services/seed'
import { useSquareFit } from '@/composables/useSquareFit'
import {
  BALL_RADIUS,
  COURSE_HOLES,
  aimToVelocity,
  atRest,
  inCup,
  makeHole,
  step,
  type BallState,
  type Hole,
} from '@/services/miniGolf'

const { el: boardEl, px: boardPx } = useSquareFit(190)

const route = useRoute()
const router = useRouter()

const STEP_MS = 8
const MAX_DRAG_FRAC = 0.38 // drag length (fraction of width) for full power

const canvasEl = ref<HTMLCanvasElement | null>(null)
const seedCode = ref('')
const holeIndex = ref(0)
const strokes = ref(0)
const totalStrokes = ref(0)
const totalPar = ref(0)
const phase = ref<'aim' | 'rolling' | 'holed' | 'done'>('aim')
const snackbar = ref(false)

let hole: Hole = makeHole(0, 'init')
let ball: BallState = { p: { ...hole.start }, v: { x: 0, y: 0 } }
let raf = 0
let lastTs = 0
let acc = 0

let aiming = false
let dragStart = { x: 0, y: 0 }
let dragCur = { x: 0, y: 0 }

const par = computed(() => hole.par)
const toPar = computed(() => {
  const diff = totalStrokes.value - totalPar.value
  if (diff === 0) return 'even'
  return diff > 0 ? `+${diff}` : `${diff}`
})

const stopLoop = () => {
  cancelAnimationFrame(raf)
  raf = 0
}

const loadHole = () => {
  hole = makeHole(holeIndex.value, seedCode.value)
  ball = { p: { ...hole.start }, v: { x: 0, y: 0 } }
  strokes.value = 0
  phase.value = 'aim'
  aiming = false
  draw()
}

const draw = () => {
  const canvas = canvasEl.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  const S = boardPx.value
  if (canvas.width !== S * dpr || canvas.height !== S * dpr) {
    canvas.width = S * dpr
    canvas.height = S * dpr
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  // Green
  ctx.fillStyle = '#166534'
  ctx.fillRect(0, 0, S, S)
  ctx.fillStyle = 'rgba(255,255,255,0.03)'
  for (let i = 0; i < S; i += 16) ctx.fillRect(0, i, S, 8) // subtle mow stripes

  // Walls
  ctx.fillStyle = '#5b3a1e'
  for (const w of hole.walls) ctx.fillRect(w.x * S, w.y * S, w.w * S, w.h * S)

  // Cup + flag
  const cx = hole.cup.x * S
  const cy = hole.cup.y * S
  ctx.beginPath()
  ctx.arc(cx, cy, hole.cupRadius * S * 0.6, 0, Math.PI * 2)
  ctx.fillStyle = '#0b1020'
  ctx.fill()
  ctx.strokeStyle = '#e2e8f0'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx, cy - S * 0.09)
  ctx.stroke()
  ctx.fillStyle = '#ef4444'
  ctx.beginPath()
  ctx.moveTo(cx, cy - S * 0.09)
  ctx.lineTo(cx + S * 0.05, cy - S * 0.075)
  ctx.lineTo(cx, cy - S * 0.06)
  ctx.closePath()
  ctx.fill()

  // Aim line (pull-back-to-shoot)
  if (aiming) {
    const dx = dragCur.x - dragStart.x
    const dy = dragCur.y - dragStart.y
    const len = Math.hypot(dx, dy)
    const power = Math.min(1, len / (MAX_DRAG_FRAC * S))
    const bx = ball.p.x * S
    const by = ball.p.y * S
    if (len > 2) {
      const ux = -dx / len
      const uy = -dy / len
      const reach = power * S * 0.4
      ctx.strokeStyle = `rgba(248, 250, 252, ${0.4 + power * 0.5})`
      ctx.lineWidth = 3
      ctx.setLineDash([6, 6])
      ctx.beginPath()
      ctx.moveTo(bx, by)
      ctx.lineTo(bx + ux * reach, by + uy * reach)
      ctx.stroke()
      ctx.setLineDash([])
      // Power pip at the ball
      ctx.fillStyle = power > 0.85 ? '#ef4444' : '#facc15'
      ctx.fillRect(bx - 14, by + BALL_RADIUS * S + 6, 28 * power, 4)
    }
  }

  // Ball
  ctx.beginPath()
  ctx.arc(ball.p.x * S, ball.p.y * S, BALL_RADIUS * S, 0, Math.PI * 2)
  ctx.fillStyle = '#f8fafc'
  ctx.shadowColor = 'rgba(0,0,0,0.4)'
  ctx.shadowBlur = 6
  ctx.fill()
  ctx.shadowBlur = 0
}

const holed = () => {
  phase.value = 'holed'
  stopLoop()
  totalStrokes.value += strokes.value
  totalPar.value += hole.par
  draw()
}

const loop = (ts: number) => {
  if (phase.value !== 'rolling') return
  const dt = lastTs ? Math.min(48, ts - lastTs) : STEP_MS
  lastTs = ts
  acc += dt
  while (acc >= STEP_MS) {
    ball = step(ball, hole.walls, STEP_MS)
    acc -= STEP_MS
    if (inCup(ball, hole)) {
      holed()
      return
    }
  }
  if (atRest(ball)) {
    ball.v = { x: 0, y: 0 }
    phase.value = 'aim'
    draw()
    return
  }
  draw()
  raf = requestAnimationFrame(loop)
}

const startRolling = () => {
  phase.value = 'rolling'
  lastTs = 0
  acc = 0
  stopLoop()
  raf = requestAnimationFrame(loop)
}

const pointerPos = (e: PointerEvent, el: HTMLElement) => {
  const rect = el.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

const onPointerDown = (e: PointerEvent) => {
  if (phase.value !== 'aim') return
  aiming = true
  dragStart = pointerPos(e, e.currentTarget as HTMLElement)
  dragCur = { ...dragStart }
}
const onPointerMove = (e: PointerEvent) => {
  if (!aiming) return
  dragCur = pointerPos(e, e.currentTarget as HTMLElement)
  draw()
}
const onPointerUp = () => {
  if (!aiming) return
  aiming = false
  const S = boardPx.value
  const dx = dragCur.x - dragStart.x
  const dy = dragCur.y - dragStart.y
  const len = Math.hypot(dx, dy)
  const power = Math.min(1, len / (MAX_DRAG_FRAC * S))
  if (power < 0.06) {
    draw()
    return // too small — treat as a cancel
  }
  ball.v = aimToVelocity({ x: dx / S, y: dy / S }, power)
  strokes.value += 1
  startRolling()
}

const nextHole = () => {
  if (holeIndex.value + 1 >= COURSE_HOLES) {
    phase.value = 'done'
    return
  }
  holeIndex.value += 1
  loadHole()
}

const newCourse = () => {
  seedCode.value = randomSeed()
  router.replace({ name: 'mini-golf', params: { seed: seedCode.value } })
  holeIndex.value = 0
  totalStrokes.value = 0
  totalPar.value = 0
  loadHole()
}

const share = async () => {
  const url = window.location.origin + `/mini-golf/${seedCode.value}`
  await copyToClipboard(`Play this 9-hole mini golf course:\n${url}`)
  snackbar.value = true
}

watch(boardPx, draw)

onMounted(() => {
  const p = typeof route.params.seed === 'string' ? route.params.seed : ''
  seedCode.value = p || randomSeed()
  if (!p) router.replace({ name: 'mini-golf', params: { seed: seedCode.value } })
  loadHole()
  // Catch a mouse-up that lands outside the canvas so aiming never sticks.
  window.addEventListener('pointerup', onPointerUp)
})
onBeforeUnmount(() => {
  stopLoop()
  window.removeEventListener('pointerup', onPointerUp)
})
</script>

<template>
  <v-container class="py-6" max-width="560">
    <GameToolbar title="Mini Golf" shareable @share="share">
      <template #intro>
        Drag and pull back to aim and set power — like a slingshot — then release to putt. Bounce off
        the walls and sink the ball in as few strokes as you can, across nine holes.
      </template>
      <template #settings>
        <v-btn variant="tonal" color="primary" prepend-icon="mdi-refresh" @click="newCourse">New course</v-btn>
      </template>
      <template #info>
        <h3>Goal</h3>
        <p>Sink the ball in each cup using as few strokes as possible. Your score is total strokes against the course par.</p>
        <h3>Controls</h3>
        <ul>
          <li>Press and drag <em>away</em> from the direction you want to putt — a longer drag means more power.</li>
          <li>Release to shoot. A tiny drag cancels.</li>
          <li>The ball must be slow enough over the cup to drop — blast it and it'll lip out.</li>
        </ul>
        <h3>Tips</h3>
        <ul>
          <li>Use the walls to bank shots around obstacles.</li>
          <li>Ease off near the hole so the ball stays in.</li>
        </ul>
      </template>
    </GameToolbar>

    <!-- HUD -->
    <div class="d-flex align-center ga-3 mb-3">
      <div class="text-h6">Hole {{ holeIndex + 1 }}<span class="text-medium-emphasis text-body-2">/{{ COURSE_HOLES }}</span></div>
      <v-chip size="small" variant="tonal">Par {{ par }}</v-chip>
      <div class="text-body-2">Strokes: <span class="font-weight-bold">{{ strokes }}</span></div>
      <v-spacer />
      <div class="text-body-2 text-medium-emphasis">Total {{ totalStrokes }} ({{ toPar }})</div>
    </div>

    <div ref="boardEl" class="stage" :style="{ width: boardPx + 'px', height: boardPx + 'px' }">
      <canvas
        ref="canvasEl"
        class="canvas"
        :style="{ width: boardPx + 'px', height: boardPx + 'px' }"
        @pointerdown.prevent="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      />

      <div v-if="phase === 'holed'" class="overlay">
        <p class="text-h4 mb-1">
          {{ strokes === 1 ? 'Hole in one! 🎉' : `Holed in ${strokes}` }}
        </p>
        <p class="text-body-1 mb-4">Par {{ par }} — {{ strokes <= par ? 'nice' : 'keep at it' }}</p>
        <v-btn color="primary" variant="flat" prepend-icon="mdi-arrow-right" @click="nextHole">
          {{ holeIndex + 1 >= COURSE_HOLES ? 'Finish' : `Hole ${holeIndex + 2}` }}
        </v-btn>
      </div>

      <div v-else-if="phase === 'done'" class="overlay">
        <p class="text-h4 mb-1">Course complete!</p>
        <p class="text-body-1 mb-1">{{ totalStrokes }} strokes</p>
        <p class="text-h6 mb-4">{{ toPar === 'even' ? 'Even par' : `${toPar} to par` }}</p>
        <v-btn color="primary" variant="flat" prepend-icon="mdi-refresh" @click="newCourse">New course</v-btn>
      </div>
    </div>

    <v-snackbar v-model="snackbar" :timeout="2600" color="secondary">Course link copied — share it!</v-snackbar>
  </v-container>
</template>

<style scoped>
.stage {
  position: relative;
  margin: 0 auto;
  border-radius: 14px;
  overflow: hidden;
  border: 2px solid rgba(120, 80, 40, 0.6);
  box-shadow: 0 0 40px rgba(22, 101, 52, 0.25);
}
.canvas {
  display: block;
  touch-action: none;
}
.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 0 16px;
  background: rgba(2, 6, 23, 0.78);
  backdrop-filter: blur(3px);
}
</style>
