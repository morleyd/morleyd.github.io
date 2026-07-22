<script setup lang="ts">
/**
 * Ball Bounce — a doodle-jump climber. The ball bounces automatically off
 * platforms; you steer left/right (hold a side, or arrow keys) to line up the
 * next platform. The camera only rises — fall below the bottom and it's over.
 * Canvas-rendered; physics/platforms come from services/ballBounce.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import GameToolbar from '@/components/GameToolbar.vue'
import { copyToClipboard } from '@/services/share'
import {
  BALL_RADIUS,
  BOUNCE_VY,
  type Ball,
  heightScore,
  nearestPlatformIndex,
  platformAt,
  platformBroken,
  stepBall,
  trackMaxHeight,
  tryBounce,
} from '@/services/ballBounce'

// The play area is a vertical column: as TALL as the visible viewport allows and
// proportionally wide. We size it directly (rather than the square-fit helper)
// so desktop gets a big column instead of a tiny sliver, while mobile still fills
// the width. COLUMN_ASPECT is width / height; RESERVE_BOTTOM is space kept for the
// page's bottom padding/footer beneath the board.
const COLUMN_ASPECT = 0.72
const RESERVE_BOTTOM = 28
const boardEl = ref<HTMLElement | null>(null)
const displayH = ref(420)
const displayW = ref(Math.round(420 * COLUMN_ASPECT))

const recomputeSize = () => {
  const node = boardEl.value
  const parent = node?.parentElement
  if (!node || !parent) return
  const cs = getComputedStyle(parent)
  const availW = parent.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
  const top = node.getBoundingClientRect().top
  // Smallest of every viewport-height signal — mobile browsers disagree on which
  // reports the visible area, so the min is safest (matches useSquareFit).
  const viewportH = Math.min(
    window.visualViewport?.height ?? Infinity,
    window.innerHeight || Infinity,
    document.documentElement.clientHeight || Infinity,
  )
  const availH = viewportH - top - RESERVE_BOTTOM
  // Fill the height, but never let the proportional width overflow the container.
  const h = Math.max(200, Math.floor(Math.min(availH, availW / COLUMN_ASPECT)))
  displayH.value = h
  displayW.value = Math.floor(h * COLUMN_ASPECT)
}

const BEST_KEY = 'ballbounce-best'
const UNITS_VISIBLE = 7 // keeps at most ~5 shelves on screen at the tightest spacing
const BALL_SCREEN = 0.42

const canvasEl = ref<HTMLCanvasElement | null>(null)
const state = ref<'idle' | 'running' | 'over'>('idle')
const best = ref(0)
const snackbar = ref(false)

let ball: Ball = { x: 0.5, y: BALL_RADIUS, vx: 0, vy: BOUNCE_VY }
let seed = 1
// Reactive so the Height readout updates as the ball climbs — a plain variable
// here would leave the `score` computed frozen at its first value (always 0).
const maxY = ref(0)
let cameraY = 0
let steer: -1 | 0 | 1 = 0
let pointerActive = false
let leftKey = false
let rightKey = false
let raf = 0
let lastTs = 0
// How many times each shelf (by index) has been bounced — shelves break at MAX_BOUNCES.
const bounceCounts = new Map<number, number>()

const score = computed(() => heightScore(maxY.value))
const fallLimit = (1 - BALL_SCREEN) * UNITS_VISIBLE

const reset = () => {
  seed = (Math.floor(Math.random() * 0xffffffff) || 1) >>> 0
  const p0 = platformAt(seed, 0)
  ball = { x: p0.x, y: BALL_RADIUS, vx: 0, vy: BOUNCE_VY }
  maxY.value = 0
  cameraY = 0
  steer = 0
  pointerActive = false
  leftKey = false
  rightKey = false
  bounceCounts.clear()
}

const gameOver = () => {
  state.value = 'over'
  cancelAnimationFrame(raf)
  raf = 0
  steer = 0
  pointerActive = false
  leftKey = false
  rightKey = false
  if (score.value > best.value) {
    best.value = score.value
    try {
      localStorage.setItem(BEST_KEY, String(best.value))
    } catch {
      // ignore
    }
  }
}

const yToScreen = (worldY: number, H: number, unit: number) =>
  BALL_SCREEN * H - (worldY - cameraY) * unit

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
  ctx.fillStyle = '#0a0f1e'
  ctx.fillRect(0, 0, W, H)

  const unit = H / UNITS_VISIBLE

  // Shelves in view (skip any that have broken away).
  const topY = cameraY + BALL_SCREEN * UNITS_VISIBLE
  const botY = cameraY - (1 - BALL_SCREEN) * UNITS_VISIBLE
  const lo = Math.max(0, nearestPlatformIndex(botY) - 1)
  const hi = nearestPlatformIndex(topY) + 1
  for (let i = lo; i <= hi; i += 1) {
    const count = bounceCounts.get(i) ?? 0
    if (platformBroken(count)) continue
    const p = platformAt(seed, i)
    const sy = yToScreen(p.y, H, unit)
    if (sy < -20 || sy > H + 20) continue
    const pw = p.width * W
    const px = p.x * W - pw / 2
    // Grey start shelf; green normally; amber once it's been bounced (about to break).
    ctx.fillStyle = i === 0 ? '#475569' : count > 0 ? '#f59e0b' : '#34d399'
    ctx.fillRect(px, sy - 6, pw, 10)
    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    ctx.fillRect(px, sy - 6, pw, 3)
  }

  // Ball
  const bx = ball.x * W
  const by = yToScreen(ball.y, H, unit)
  ctx.beginPath()
  ctx.arc(bx, by, BALL_RADIUS * W, 0, Math.PI * 2)
  ctx.fillStyle = '#f472b6'
  ctx.shadowColor = '#f472b6'
  ctx.shadowBlur = 14
  ctx.fill()
  ctx.shadowBlur = 0
}

const tick = (ts: number) => {
  if (state.value !== 'running') return
  const dt = lastTs ? Math.min(48, ts - lastTs) : 16
  lastTs = ts

  const prevY = ball.y
  ball = stepBall(ball, steer, dt)

  // Bounce off the top of any (unbroken) shelf the ball crossed downward this
  // step, and count the bounce so the shelf breaks after MAX_BOUNCES.
  if (ball.vy <= 0) {
    const center = nearestPlatformIndex(ball.y)
    for (let i = Math.max(0, center - 2); i <= center + 2; i += 1) {
      const count = bounceCounts.get(i) ?? 0
      if (platformBroken(count)) continue
      const bounced = tryBounce(ball, prevY, platformAt(seed, i))
      if (bounced) {
        ball = bounced
        bounceCounts.set(i, count + 1)
        break
      }
    }
  }

  maxY.value = trackMaxHeight(maxY.value, ball.y)
  cameraY = Math.max(cameraY, ball.y) // camera only rises

  if (ball.y - cameraY < -fallLimit) {
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

const steerFromX = (clientX: number, el: HTMLElement) => {
  const rect = el.getBoundingClientRect()
  steer = clientX - rect.left < rect.width / 2 ? -1 : 1
}

const onPointerDown = (e: PointerEvent) => {
  if (state.value !== 'running') start()
  pointerActive = true
  steerFromX(e.clientX, e.currentTarget as HTMLElement) // steer even on the starting press
}
const onPointerMove = (e: PointerEvent) => {
  if (state.value === 'running' && pointerActive) steerFromX(e.clientX, e.currentTarget as HTMLElement)
}
const stopSteer = () => {
  pointerActive = false
  steer = 0
}

// Track both arrow keys so releasing one doesn't cancel the other still held.
const applyKeySteer = () => {
  steer = leftKey === rightKey ? 0 : leftKey ? -1 : 1
}
const onKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'ArrowLeft' || e.key === 'a') {
    e.preventDefault()
    if (state.value !== 'running') start()
    leftKey = true
    applyKeySteer()
  } else if (e.key === 'ArrowRight' || e.key === 'd') {
    e.preventDefault()
    if (state.value !== 'running') start()
    rightKey = true
    applyKeySteer()
  }
}
const onKeyUp = (e: KeyboardEvent) => {
  if (e.key === 'ArrowLeft' || e.key === 'a') leftKey = false
  else if (e.key === 'ArrowRight' || e.key === 'd') rightKey = false
  else return
  applyKeySteer()
}

const share = async () => {
  const url = window.location.origin + '/ball-bounce'
  await copyToClipboard(
    `I climbed to ${score.value} in Ball Bounce${score.value === best.value && score.value > 0 ? ' (my best!)' : ''}. Beat me!\n${url}`,
  )
  snackbar.value = true
}

watch([displayW, displayH], () => {
  if (state.value !== 'running') draw()
})

const onResize = () => recomputeSize()

onMounted(() => {
  try {
    best.value = Number(localStorage.getItem(BEST_KEY)) || 0
  } catch {
    best.value = 0
  }
  reset()
  recomputeSize()
  // Re-measure after layout/fonts settle and the mobile address bar animates.
  requestAnimationFrame(recomputeSize)
  setTimeout(recomputeSize, 150)
  setTimeout(recomputeSize, 500)
  draw()
  window.addEventListener('resize', onResize)
  window.addEventListener('orientationchange', onResize)
  window.visualViewport?.addEventListener('resize', onResize)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('orientationchange', onResize)
  window.visualViewport?.removeEventListener('resize', onResize)
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
})
</script>

<template>
  <v-container class="py-6" max-width="720">
    <GameToolbar title="Ball Bounce" shareable @share="share">
      <template #intro>
        The ball bounces on its own — steer <strong>left</strong> and <strong>right</strong> (hold a
        side, or arrow keys) to land on the next platform. The view only climbs; fall off the bottom
        and it's over.
      </template>
      <template #info>
        <h3>Goal</h3>
        <p>Bounce as high as you can, platform to platform, without dropping off the bottom of the screen.</p>
        <h3>Controls</h3>
        <ul>
          <li>Hold the left or right half of the screen to drift that way (and slide across to keep steering).</li>
          <li>Desktop: <span class="k">←</span>/<span class="k">→</span> or <span class="k">A</span>/<span class="k">D</span>.</li>
          <li>The ball wraps around the screen edges.</li>
        </ul>
        <h3>Rules</h3>
        <ul>
          <li>You only bounce off the <strong>top</strong> of a shelf, and only while falling.</li>
          <li>Shelves <strong>break after two bounces</strong> (they turn amber first) — keep climbing, you can't camp on one.</li>
          <li>Shelves spread <strong>further apart the higher you climb</strong>, so it gets harder.</li>
        </ul>
        <h3>Tips</h3>
        <ul>
          <li>Line up the next shelf while you're rising — you can't change a miss once you're falling past it.</li>
          <li>Use the wrap: sometimes the quickest path to a shelf is off the far edge.</li>
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
        @pointerdown.prevent="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="stopSteer"
        @pointercancel="stopSteer"
      />
      <div v-if="state !== 'running'" class="overlay">
        <template v-if="state === 'idle'">
          <p class="text-h6 mb-2">Steer to land the bounces</p>
          <v-btn color="primary" variant="flat" @click="start">Start</v-btn>
        </template>
        <template v-else>
          <p class="text-h5 mb-1">Game over</p>
          <p class="text-body-2 mb-3">
            Height {{ score }}<span v-if="score === best && score > 0"> — new best!</span>
          </p>
          <div class="d-flex ga-2">
            <v-btn color="primary" variant="flat" prepend-icon="mdi-restart" @click="start">Bounce again</v-btn>
            <v-btn variant="tonal" prepend-icon="mdi-share-variant" @click="share">Share</v-btn>
          </div>
        </template>
      </div>
    </div>
    <v-snackbar v-model="snackbar" :timeout="2600" color="secondary">Score copied — challenge a friend!</v-snackbar>
  </v-container>
</template>

<style scoped>
.stage {
  position: relative;
  margin: 0 auto;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.2);
  box-shadow: 0 0 40px rgba(52, 211, 153, 0.15);
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
  background: rgba(2, 6, 23, 0.7);
  backdrop-filter: blur(2px);
}
</style>
