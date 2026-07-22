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
  atRest,
  courseResult,
  effectiveWalls,
  holeResult,
  inCup,
  inHazard,
  makeHole,
  moverRectAt,
  planPutt,
  step,
  type BallState,
  type Hole,
  type Result,
} from '@/services/miniGolf'

const { el: boardEl, px: boardPx } = useSquareFit(36)

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
const holeMsg = ref<Result | null>(null)
const courseMsg = ref<Result | null>(null)
const hazardFlash = ref(false)

let hole: Hole = makeHole(0, 'init')
let ball: BallState = { p: { ...hole.start }, v: { x: 0, y: 0 } }
let raf = 0
let lastTs = 0
let acc = 0
let simMs = 0 // clock for moving obstacles

let aiming = false
let dragStart = { x: 0, y: 0 }
let dragCur = { x: 0, y: 0 }
let flashTimer = 0

// `hole` is a plain (non-reactive) let that gets reassigned per hole, so par is
// mirrored into a ref and refreshed on load — otherwise the HUD would freeze on
// the first hole's par (the original "par is always 2" bug).
const par = ref(hole.par)
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
  par.value = hole.par
  ball = { p: { ...hole.start }, v: { x: 0, y: 0 } }
  strokes.value = 0
  phase.value = 'aim'
  aiming = false
  holeMsg.value = null
  simMs = 0
  startLoop()
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

  // Hazards (pits) — drawn under the walls/ball
  for (const hz of hole.hazards) {
    const hx = hz.p.x * S
    const hy = hz.p.y * S
    const hr = hz.r * S
    ctx.beginPath()
    ctx.arc(hx, hy, hr, 0, Math.PI * 2)
    ctx.fillStyle = '#0c4a6e'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(hx, hy, hr * 0.7, 0, Math.PI * 2)
    ctx.fillStyle = '#075985'
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = 'rgba(8, 47, 73, 0.9)'
    ctx.beginPath()
    ctx.arc(hx, hy, hr, 0, Math.PI * 2)
    ctx.stroke()
  }

  // Static walls
  ctx.fillStyle = '#5b3a1e'
  for (const w of hole.walls) ctx.fillRect(w.x * S, w.y * S, w.w * S, w.h * S)

  // Moving walls (current position) — a lighter timber so they read as "live"
  ctx.fillStyle = '#a16207'
  for (const m of hole.movers) {
    const r = moverRectAt(m, simMs)
    ctx.fillRect(r.x * S, r.y * S, r.w * S, r.h * S)
  }

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
  aiming = false
  detachDrag()
  stopLoop()
  totalStrokes.value += strokes.value
  totalPar.value += hole.par
  holeMsg.value = holeResult(strokes.value, hole.par)
  draw()
}

// The ball fell in a hazard: send it back to the tee. The swing is already spent,
// so this costs the player without a phantom stroke.
const resetToTee = () => {
  ball = { p: { ...hole.start }, v: { x: 0, y: 0 } }
  phase.value = 'aim'
  aiming = false
  detachDrag()
  hazardFlash.value = true
  clearTimeout(flashTimer)
  flashTimer = window.setTimeout(() => (hazardFlash.value = false), 1100)
}

// One continuous loop: moving obstacles animate every frame; physics advances
// the WHOLE time the ball is rolling — including while the player is mid-aim, so
// touching a rolling ball never stops it and the sink check always runs. A swing
// simply redirects the still-moving ball from its current spot on release.
const loop = (ts: number) => {
  const dt = lastTs ? Math.min(48, ts - lastTs) : STEP_MS
  lastTs = ts
  simMs += dt

  if (phase.value === 'rolling') {
    acc += dt
    while (acc >= STEP_MS) {
      ball = step(ball, effectiveWalls(hole, simMs), STEP_MS)
      acc -= STEP_MS
      if (inHazard(ball, hole)) {
        resetToTee()
        break
      }
      if (inCup(ball, hole)) {
        holed()
        return
      }
    }
    if (phase.value === 'rolling' && atRest(ball)) {
      ball.v = { x: 0, y: 0 }
      phase.value = 'aim'
    }
  }

  draw()
  if (phase.value === 'aim' || phase.value === 'rolling') raf = requestAnimationFrame(loop)
}

const startLoop = () => {
  stopLoop()
  lastTs = 0
  acc = 0
  raf = requestAnimationFrame(loop)
}

// Pointer position relative to the canvas — works even when the pointer is
// beyond the canvas edges, so the drag can extend off-screen.
const pointerPos = (e: PointerEvent) => {
  const canvas = canvasEl.value
  if (!canvas) return { x: 0, y: 0 }
  const rect = canvas.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

// While dragging, track the pointer on the window so aim + power keep updating
// (and the putt still registers) even when the pointer leaves the play area.
const detachDrag = () => {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
}

const onPointerDown = (e: PointerEvent) => {
  // A swing is allowed while the ball is still rolling. The ball keeps moving
  // during the aim (physics never pauses); on release the shot redirects it from
  // wherever it is. `aiming` only controls the aim overlay + drag capture.
  if (phase.value !== 'aim' && phase.value !== 'rolling') return
  aiming = true
  dragStart = pointerPos(e)
  dragCur = { ...dragStart }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
}
function onPointerMove(e: PointerEvent) {
  if (!aiming) return
  dragCur = pointerPos(e)
  draw()
}
function onPointerUp() {
  if (!aiming) return
  aiming = false
  detachDrag()
  const putt = planPutt(
    { x: dragCur.x - dragStart.x, y: dragCur.y - dragStart.y },
    boardPx.value,
    MAX_DRAG_FRAC,
  )
  // A cancel (tiny drag) — or an interaction that resolved into a non-playable
  // phase (holed/done) — is a pure no-op: the ball is never touched, so a rolling
  // ball keeps rolling exactly as before.
  if (!putt.counts || (phase.value !== 'aim' && phase.value !== 'rolling')) {
    draw()
    return
  }
  // Redirect the ball from its current position (costs a stroke).
  ball.v = { ...putt.velocity }
  strokes.value += 1
  phase.value = 'rolling'
  draw()
}

const nextHole = () => {
  if (holeIndex.value + 1 >= COURSE_HOLES) {
    courseMsg.value = courseResult(totalStrokes.value, totalPar.value)
    phase.value = 'done'
    stopLoop()
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
})
onBeforeUnmount(() => {
  stopLoop()
  detachDrag()
  clearTimeout(flashTimer)
})
</script>

<template>
  <v-container fluid class="golf-container py-6">
    <div class="golf-head">
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
            <li>You can swing again while the ball is still rolling — grab it to redirect a moving ball (it still counts as a stroke).</li>
            <li>The ball must be slow enough over the cup to drop — blast it and it'll lip out.</li>
          </ul>
          <h3>Hazards</h3>
          <ul>
            <li>Blue pits swallow the ball and send it back to the tee — the wasted swing still counts.</li>
            <li>The lighter timber walls slide back and forth; time your shot or go around.</li>
          </ul>
          <h3>Tips</h3>
          <ul>
            <li>Use the walls to bank shots around obstacles. Holes get longer and busier as you go.</li>
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
    </div>

    <div ref="boardEl" class="stage" :style="{ width: boardPx + 'px', height: boardPx + 'px' }">
      <canvas
        ref="canvasEl"
        class="canvas"
        :style="{ width: boardPx + 'px', height: boardPx + 'px' }"
        @pointerdown.prevent="onPointerDown"
      />

      <transition name="fade">
        <div v-if="hazardFlash" class="hazard-flash">Splash! Back to the tee</div>
      </transition>

      <div v-if="phase === 'holed'" class="overlay">
        <p class="text-h4 mb-1">{{ holeMsg?.term ?? `Holed in ${strokes}` }}</p>
        <p class="text-body-1 mb-1">{{ holeMsg?.blurb }}</p>
        <p class="text-body-2 text-medium-emphasis mb-4">Holed in {{ strokes }} — par {{ par }}</p>
        <v-btn color="primary" variant="flat" prepend-icon="mdi-arrow-right" @click="nextHole">
          {{ holeIndex + 1 >= COURSE_HOLES ? 'Finish' : `Hole ${holeIndex + 2}` }}
        </v-btn>
      </div>

      <div v-else-if="phase === 'done'" class="overlay">
        <p class="text-h4 mb-1">{{ courseMsg?.term ?? 'Course complete!' }}</p>
        <p class="text-body-1 mb-1">{{ courseMsg?.blurb }}</p>
        <p class="text-body-2 text-medium-emphasis mb-1">{{ totalStrokes }} strokes</p>
        <p class="text-h6 mb-4">{{ toPar === 'even' ? 'Even par' : `${toPar} to par` }}</p>
        <v-btn color="primary" variant="flat" prepend-icon="mdi-refresh" @click="newCourse">New course</v-btn>
      </div>
    </div>

    <v-snackbar v-model="snackbar" :timeout="2600" color="secondary">Course link copied — share it!</v-snackbar>
  </v-container>
</template>

<style scoped>
/* Text/HUD stay in a comfortable reading column; the play area is free to grow
   as wide (and tall) as the viewport allows so it fills the desktop screen. */
.golf-container {
  max-width: 1200px;
}
.golf-head {
  max-width: 640px;
  margin: 0 auto;
}
.stage {
  position: relative;
  margin: 0 auto;
  border-radius: 14px;
  overflow: hidden;
  border: 2px solid rgba(120, 80, 40, 0.6);
  box-shadow: 0 0 40px rgba(22, 101, 52, 0.25);
}
.hazard-flash {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 14px;
  border-radius: 999px;
  background: rgba(3, 105, 161, 0.92);
  color: #f0f9ff;
  font-weight: 600;
  font-size: 0.9rem;
  white-space: nowrap;
  pointer-events: none;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
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
