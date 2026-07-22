<script setup lang="ts">
/**
 * Vertical Tunnel — flap a ball UP a weaving, narrowing tunnel. It's Flappy-Bird
 * rotated vertical: gravity constantly drags the ball down, and every tap (or
 * arrow/space key) flaps it back up. Tapping the left/right half also nudges the
 * ball that way. Stop flapping and you sink — fall off the bottom of the course
 * or clip a wall and it's over. The camera climbs to follow the ball but never
 * scrolls back down. Rendered on a canvas; physics/course come from
 * services/tunnel. Endless, with a best-height score in localStorage.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import GameToolbar from '@/components/GameToolbar.vue'
import { useSquareFit } from '@/composables/useSquareFit'
import {
  FLYER_RADIUS,
  cameraBottomFor,
  collides,
  difficultyFor,
  flap,
  flapUp,
  hasFallenOff,
  segmentAt,
  stepFlyer,
  type FlyerState,
} from '@/services/tunnel'

// A tall, portrait play column that fills most of the viewport. useSquareFit
// gives a width-safe board size (handling mobile address-bar quirks); we take
// the full available height for the column and a slimmer width from it, so the
// tunnel is big on desktop AND mobile. Physics are resolution-independent, so a
// larger canvas only means more px per unit — the feel is unchanged, just bigger.
const { el: boardEl, px: boardPx } = useSquareFit(24)
const availH = ref(480)
const measureHeight = () => {
  const node = boardEl.value
  if (!node) return
  const top = node.getBoundingClientRect().top
  const vh = Math.min(
    window.visualViewport?.height ?? Infinity,
    window.innerHeight || Infinity,
    document.documentElement.clientHeight || Infinity,
  )
  availH.value = Math.max(240, Math.floor(vh - top - 20))
}
const displayH = computed(() => availH.value)
const displayW = computed(() => Math.min(Math.round(availH.value * 0.62), boardPx.value))

const BEST_KEY = 'tunnel-best'
const ROW_FRAC = 0.14 // one course row = 14% of width, in px

const canvasEl = ref<HTMLCanvasElement | null>(null)
const state = ref<'idle' | 'running' | 'over'>('idle')
const distance = ref(0)
const best = ref(0)

let flyer: FlyerState = { x: 0.5, vx: 0, y: 0, vy: 0 }
let seed = 1
let raf = 0
let lastTs = 0
let camBottom = 0

const score = computed(() => Math.floor(distance.value))

const rowPxNow = () => displayW.value * ROW_FRAC
const viewRowsNow = () => displayH.value / rowPxNow()

const reset = () => {
  flyer = { x: 0.5, vx: 0, y: 0, vy: 0 }
  distance.value = 0
  camBottom = cameraBottomFor(Number.NEGATIVE_INFINITY, flyer.y, viewRowsNow())
  seed = (Math.floor(Math.random() * 0xffffffff) || 1) >>> 0
}

const gameOver = () => {
  state.value = 'over'
  cancelAnimationFrame(raf)
  raf = 0
  if (score.value > best.value) {
    best.value = score.value
    try {
      localStorage.setItem(BEST_KEY, String(best.value))
    } catch {
      // ignore
    }
  }
}

const draw = () => {
  const canvas = canvasEl.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  const W = displayW.value
  const H = displayH.value
  if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
    canvas.width = W * dpr
    canvas.height = H * dpr
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  // Background
  ctx.fillStyle = '#020617'
  ctx.fillRect(0, 0, W, H)

  const rowPx = W * ROW_FRAC

  // Draw wall bands from the bottom of the screen up past the top, mapped
  // through the camera: row k sits (k - camBottom) rows above the bottom edge.
  const kMin = Math.floor(camBottom) - 1
  const kMax = Math.ceil(camBottom + H / rowPx) + 1
  for (let k = kMin; k <= kMax; k += 1) {
    if (k < 0) continue
    const seg = segmentAt(seed, k, difficultyFor(k))
    const y = H - (k - camBottom) * rowPx
    const h = rowPx + 1.5
    ctx.fillStyle = '#1e293b'
    ctx.fillRect(0, y - h, seg.left * W, h)
    ctx.fillRect(seg.right * W, y - h, W - seg.right * W, h)
    // Edge glow
    ctx.fillStyle = 'rgba(56, 189, 248, 0.5)'
    ctx.fillRect(seg.left * W - 2, y - h, 2, h)
    ctx.fillRect(seg.right * W, y - h, 2, h)
  }

  // Flyer
  const fx = flyer.x * W
  const fy = H - (flyer.y - camBottom) * rowPx
  ctx.beginPath()
  ctx.arc(fx, fy, FLYER_RADIUS * W, 0, Math.PI * 2)
  ctx.fillStyle = '#f472b6'
  ctx.shadowColor = '#f472b6'
  ctx.shadowBlur = 16
  ctx.fill()
  ctx.shadowBlur = 0
}

const tick = (ts: number) => {
  if (state.value !== 'running') return
  const dt = lastTs ? Math.min(48, ts - lastTs) : 16
  lastTs = ts

  flyer = stepFlyer(flyer, dt)
  distance.value = Math.max(distance.value, flyer.y) // score = highest row climbed

  const viewRows = viewRowsNow()
  camBottom = cameraBottomFor(camBottom, flyer.y, viewRows)

  // Sank off the bottom of the visible course → game over.
  if (hasFallenOff(flyer.y, camBottom)) {
    draw()
    gameOver()
    return
  }
  // Wall collision: test the band at the ball's current row.
  const row = Math.floor(flyer.y)
  if (row >= 0) {
    const seg = segmentAt(seed, row, difficultyFor(row))
    if (collides(flyer.x, seg)) {
      draw()
      gameOver()
      return
    }
  }
  draw()
  raf = requestAnimationFrame(tick)
}

const start = () => {
  reset()
  state.value = 'running'
  lastTs = 0
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(tick)
}

// A tap always flaps the ball up; a side tap also nudges it that way.
const tapUp = () => {
  if (state.value === 'running') flyer = flapUp(flyer)
}
const tapSide = (dir: -1 | 1) => {
  if (state.value === 'running') flyer = flap(flapUp(flyer), dir)
}

const onPointer = (e: PointerEvent) => {
  if (state.value !== 'running') {
    start()
    return
  }
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  tapSide(e.clientX - rect.left < rect.width / 2 ? -1 : 1)
}

const onKey = (e: KeyboardEvent) => {
  if (e.key === 'ArrowLeft' || e.key === 'a') {
    e.preventDefault()
    if (state.value === 'running') tapSide(-1)
    else start()
  } else if (e.key === 'ArrowRight' || e.key === 'd') {
    e.preventDefault()
    if (state.value === 'running') tapSide(1)
    else start()
  } else if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') {
    e.preventDefault()
    if (state.value === 'running') tapUp()
    else start()
  }
}

// Redraw (and re-anchor the camera) when the board is resized while idle/over.
watch([displayW, displayH], () => {
  if (state.value !== 'running') {
    camBottom = cameraBottomFor(Number.NEGATIVE_INFINITY, flyer.y, viewRowsNow())
    draw()
  }
})

const onResize = () => measureHeight()
const vv = window.visualViewport
onMounted(() => {
  try {
    best.value = Number(localStorage.getItem(BEST_KEY)) || 0
  } catch {
    best.value = 0
  }
  measureHeight()
  requestAnimationFrame(measureHeight)
  setTimeout(measureHeight, 200)
  setTimeout(measureHeight, 500)
  window.addEventListener('resize', onResize)
  window.addEventListener('orientationchange', onResize)
  vv?.addEventListener('resize', onResize)
  vv?.addEventListener('scroll', onResize)
  reset()
  draw()
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('orientationchange', onResize)
  vv?.removeEventListener('resize', onResize)
  vv?.removeEventListener('scroll', onResize)
})
</script>

<template>
  <v-container class="py-6" max-width="960">
    <GameToolbar title="Vertical Tunnel">
      <template #intro>
        Flap your ball <strong>up</strong> the tunnel. Every tap flaps upward against
        gravity — tap the <strong>left</strong> or <strong>right</strong> half to also
        drift that way (arrow keys on desktop). Keep flapping to climb; hit a wall or
        sink off the bottom and it's over.
      </template>
      <template #info>
        <h3>Goal</h3>
        <p>Flap your ball as high up the weaving tunnel as you can without crashing.</p>
        <h3>Controls</h3>
        <ul>
          <li>Tap or click to flap up. Tap the left/right half to flap and drift that way.</li>
          <li>Desktop: <span class="k">←</span>/<span class="k">→</span> (or A/D) flap and steer; <span class="k">Space</span>/<span class="k">↑</span> flaps straight up.</li>
          <li>Gravity always pulls you down — stop flapping and you fall off the bottom.</li>
        </ul>
        <h3>Tips</h3>
        <ul>
          <li>Find a steady rhythm — a touch faster than a hover keeps you rising.</li>
          <li>Line up early for the tight pinch points; the corridor breathes in and out.</li>
          <li>It narrows the higher you climb, so leave yourself slack for the walls.</li>
        </ul>
      </template>
    </GameToolbar>

    <div class="d-flex align-center mb-3">
      <div class="text-h6">Height: <span class="font-weight-bold">{{ score }}</span></div>
      <v-spacer />
      <div class="text-body-2 text-medium-emphasis">Best: {{ best }}</div>
    </div>

    <div ref="boardEl" class="stage" :style="{ width: displayW + 'px', height: displayH + 'px' }">
      <canvas
        ref="canvasEl"
        class="canvas"
        :style="{ width: displayW + 'px', height: displayH + 'px' }"
        @pointerdown.prevent="onPointer"
      />
      <div v-if="state !== 'running'" class="overlay">
        <template v-if="state === 'idle'">
          <p class="text-h6 mb-2">Tap to start</p>
          <p class="text-caption text-medium-emphasis mb-3">Tap to flap up — a side tap drifts that way</p>
          <v-btn color="primary" variant="flat" @click="start">Start</v-btn>
        </template>
        <template v-else>
          <p class="text-h5 mb-1">Crashed</p>
          <p class="text-body-2 mb-3">
            Height {{ score }}<span v-if="score === best && score > 0"> — new best!</span>
          </p>
          <v-btn color="primary" variant="flat" prepend-icon="mdi-restart" @click="start">Try again</v-btn>
        </template>
      </div>
    </div>
  </v-container>
</template>

<style scoped>
.stage {
  position: relative;
  margin: 0 auto;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.2);
  box-shadow: 0 0 40px rgba(56, 189, 248, 0.15);
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
  background: rgba(2, 6, 23, 0.7);
  backdrop-filter: blur(2px);
}
</style>
