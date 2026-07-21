<script setup lang="ts">
/**
 * Vertical Tunnel — fly upward through a scrolling, narrowing tunnel. Tap (or
 * arrow-key) the left/right side to flap that way; do nothing and you drift.
 * Hit a wall and it's over. Rendered on a canvas; physics/course come from
 * services/tunnel. Endless, with a best-distance score in localStorage.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import GameToolbar from '@/components/GameToolbar.vue'
import { useSquareFit } from '@/composables/useSquareFit'
import {
  FLYER_RADIUS,
  collides,
  difficultyFor,
  flap,
  segmentAt,
  stepFlyer,
  type FlyerState,
} from '@/services/tunnel'

const { el: boardEl, px: boardPx } = useSquareFit(150)
const displayW = computed(() => Math.round(boardPx.value * 0.64))
const displayH = computed(() => boardPx.value)

const BEST_KEY = 'tunnel-best'
const ROW_FRAC = 0.14 // one course row = 14% of width, in px
const FLYER_Y_FRAC = 0.72 // flyer's fixed vertical position

const canvasEl = ref<HTMLCanvasElement | null>(null)
const state = ref<'idle' | 'running' | 'over'>('idle')
const distance = ref(0)
const best = ref(0)

let flyer: FlyerState = { x: 0.5, vx: 0 }
let seed = 1
let raf = 0
let lastTs = 0

const score = computed(() => Math.floor(distance.value))

const reset = () => {
  flyer = { x: 0.5, vx: 0 }
  distance.value = 0
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
  const flyerY = H * FLYER_Y_FRAC

  // Draw wall bands from the bottom of the screen up past the top.
  const kMin = Math.floor(distance.value - (H - flyerY) / rowPx) - 1
  const kMax = Math.ceil(distance.value + flyerY / rowPx) + 1
  for (let k = kMin; k <= kMax; k += 1) {
    if (k < 0) continue
    const seg = segmentAt(seed, k, difficultyFor(k))
    const y = flyerY - (k - distance.value) * rowPx
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
  ctx.beginPath()
  ctx.arc(fx, flyerY, FLYER_RADIUS * W, 0, Math.PI * 2)
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

  const diff = difficultyFor(distance.value)
  const scrollSpeed = 2.6 + diff * 2.2 // rows per second
  distance.value += (scrollSpeed * dt) / 1000
  flyer = stepFlyer(flyer, dt)

  const seg = segmentAt(seed, Math.round(distance.value), difficultyFor(distance.value))
  if (collides(flyer.x, seg)) {
    draw()
    gameOver()
    return
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

const doFlap = (dir: -1 | 1) => {
  if (state.value === 'running') flyer = flap(flyer, dir)
}

const onPointer = (e: PointerEvent) => {
  if (state.value === 'idle' || state.value === 'over') {
    start()
    return
  }
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  doFlap(e.clientX - rect.left < rect.width / 2 ? -1 : 1)
}

const onKey = (e: KeyboardEvent) => {
  if (e.key === 'ArrowLeft' || e.key === 'a') {
    e.preventDefault()
    if (state.value === 'running') doFlap(-1)
    else start()
  } else if (e.key === 'ArrowRight' || e.key === 'd') {
    e.preventDefault()
    if (state.value === 'running') doFlap(1)
    else start()
  } else if (e.key === ' ') {
    e.preventDefault()
    if (state.value !== 'running') start()
  }
}

onMounted(() => {
  try {
    best.value = Number(localStorage.getItem(BEST_KEY)) || 0
  } catch {
    best.value = 0
  }
  reset()
  draw()
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <v-container class="py-6" max-width="600">
    <GameToolbar title="Vertical Tunnel">
      <template #intro>
        Fly up through the tunnel. Tap the <strong>left</strong> or <strong>right</strong> side to
        flap that way (arrow keys on desktop). Don't drift into the walls — it speeds up as you climb.
      </template>
      <template #info>
        <h3>Goal</h3>
        <p>Fly as far up the tunnel as you can without hitting a wall.</p>
        <h3>Controls</h3>
        <ul>
          <li>Tap or click the left/right half of the screen to flap left/right.</li>
          <li>Desktop: <span class="k">←</span>/<span class="k">→</span> (or A/D). <span class="k">Space</span> to start.</li>
          <li>Between flaps you keep drifting, then slow — so tap in rhythm to steer.</li>
        </ul>
        <h3>Tips</h3>
        <ul>
          <li>Small, frequent taps steer more precisely than one big flap.</li>
          <li>Look ahead to where the gap is drifting, not where it is now.</li>
        </ul>
      </template>
    </GameToolbar>

    <div class="d-flex align-center mb-3">
      <div class="text-h6">Distance: <span class="font-weight-bold">{{ score }}</span></div>
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
          <p class="text-h6 mb-2">Tap to fly</p>
          <p class="text-caption text-medium-emphasis mb-3">Left/right side flaps that way</p>
          <v-btn color="primary" variant="flat" @click="start">Start</v-btn>
        </template>
        <template v-else>
          <p class="text-h5 mb-1">Crashed</p>
          <p class="text-body-2 mb-3">
            Distance {{ score }}<span v-if="score === best && score > 0"> — new best!</span>
          </p>
          <v-btn color="primary" variant="flat" prepend-icon="mdi-restart" @click="start">Fly again</v-btn>
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
