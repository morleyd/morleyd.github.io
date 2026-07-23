<script setup lang="ts">
/**
 * Ball Bounce — a doodle-jump climber. The ball bounces automatically off
 * platforms; you steer by dragging (the ball follows your finger/cursor) or
 * with the arrow keys. The camera only rises — fall below the bottom and it's
 * over. Canvas-rendered; physics/platforms come from services/ballBounce,
 * including the special shelf kinds (springs, rockets, crumblers, faders) and
 * the bumper obstacles.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import GameToolbar from '@/components/GameToolbar.vue'
import { useViewportFit } from '@/composables/useViewportFit'
import { copyToClipboard } from '@/services/share'
import { burstConfetti } from '@/services/confetti'
import {
  BALL_RADIUS,
  BOUNCE_VY,
  COLUMN_ASPECT,
  FADING_TTL_MS,
  UNITS_VISIBLE,
  type Ball,
  type Platform,
  bounceOffBumper,
  bumperAt,
  heightScore,
  nearestPlatformIndex,
  platformAt,
  platformBroken,
  stepBall,
  trackMaxHeight,
  tryBounce,
  wrapDelta,
} from '@/services/ballBounce'

// The play area is a vertical column: as TALL as the visible viewport allows and
// proportionally wide, so desktop gets a big column instead of a tiny sliver
// while mobile still fills the width. Aspect comes from the service so bumper
// collision math and the view agree on the column's shape.
const RESERVE_BOTTOM = 28
const { el: boardEl, w: displayW, h: displayH } = useViewportFit(COLUMN_ASPECT, RESERVE_BOTTOM)

const BEST_KEY = 'ballbounce-best'
const BALL_SCREEN = 0.42

const canvasEl = ref<HTMLCanvasElement | null>(null)
const state = ref<'idle' | 'running' | 'over'>('idle')
const best = ref(0)
const snackbar = ref(false)
const isNewBest = ref(false)

let ball: Ball = { x: 0.5, y: BALL_RADIUS, vx: 0, vy: BOUNCE_VY }
let seed = 1
// Reactive so the Height readout updates as the ball climbs — a plain variable
// here would leave the `score` computed frozen at its first value (always 0).
const maxY = ref(0)
let cameraY = 0
let pointerActive = false
let pointerX01 = 0.5 // last pointer x as a fraction of the board width
let leftKey = false
let rightKey = false
let raf = 0
let lastTs = 0
let runMs = 0 // accumulated GAME time this run (rAF-paced, so it pauses with the tab)
let lastBounceAt = 0 // for squash & stretch
const trail: Array<{ x: number; y: number }> = []
// How many times each shelf (by index) has been bounced — shelves break after
// their kind's bounce budget.
const bounceCounts = new Map<number, number>()
// Game-time (runMs) at which each FADING shelf took its FIRST bounce — it
// dissolves FADING_TTL_MS of PLAY time later. Keying the clock to the bounce
// (not to scrolling into view) means an untouched fader can never evaporate
// before you arrive, and backgrounding the tab (which pauses runMs) never
// silently expires one.
const fadeSeen = new Map<number, number>()
let milestone = 0 // last 100-height milestone celebrated
let milestoneShownAt = 0

// platformAt/bumperAt are pure per (seed, index) but internally build several
// RNGs per call; memoize them for the run so the 60fps draw/physics loops do
// zero generation work in steady state. Cleared with the seed on reset().
const platCache = new Map<number, Platform>()
const bumpCache = new Map<number, ReturnType<typeof bumperAt>>()
const plat = (i: number): Platform => {
  let p = platCache.get(i)
  if (!p) {
    p = platformAt(seed, i)
    platCache.set(i, p)
  }
  return p
}
const bump = (i: number) => {
  let b = bumpCache.get(i)
  if (!b) {
    b = bumperAt(seed, i)
    bumpCache.set(i, b)
  }
  return b
}

const score = computed(() => heightScore(maxY.value))
const fallLimit = (1 - BALL_SCREEN) * UNITS_VISIBLE

// A fading shelf's remaining life 0..1 (1 = fresh), or 1 for other kinds.
const fadeLife = (index: number, kind: string): number => {
  if (kind !== 'fading') return 1
  const seen = fadeSeen.get(index)
  if (seen === undefined) return 1
  return Math.max(0, 1 - (runMs - seen) / FADING_TTL_MS)
}

const shelfGone = (index: number, p: Platform): boolean => {
  if (platformBroken(bounceCounts.get(index) ?? 0, p.kind)) return true
  return p.kind === 'fading' && fadeLife(index, p.kind) <= 0
}

// The shelf-index window currently on screen (with the ±2 jitter slack).
const visibleRange = (): [number, number] => {
  const topY = cameraY + BALL_SCREEN * UNITS_VISIBLE
  const botY = cameraY - (1 - BALL_SCREEN) * UNITS_VISIBLE
  return [Math.max(0, nearestPlatformIndex(botY) - 2), nearestPlatformIndex(topY) + 2]
}

const reset = () => {
  seed = (Math.floor(Math.random() * 0xffffffff) || 1) >>> 0
  platCache.clear()
  bumpCache.clear()
  const p0 = plat(0)
  ball = { x: p0.x, y: BALL_RADIUS, vx: 0, vy: BOUNCE_VY }
  maxY.value = 0
  cameraY = 0
  runMs = 0
  pointerActive = false
  leftKey = false
  rightKey = false
  bounceCounts.clear()
  fadeSeen.clear()
  trail.length = 0
  milestone = 0
  milestoneShownAt = 0
  isNewBest.value = false
}

const QUIPS: Array<[number, string]> = [
  [0, 'The floor was closer than it looked.'],
  [30, 'A respectable hop.'],
  [80, 'Getting the hang of it!'],
  [150, 'The shelves fear you now.'],
  [250, 'Certified climber. 🧗'],
  [400, 'You have left the atmosphere.'],
  [700, 'NASA would like a word. 🚀'],
]
const quip = computed(() => {
  if (score.value >= 404 && score.value <= 413) return '404: floor not found.'
  let q = QUIPS[0][1]
  for (const [min, text] of QUIPS) if (score.value >= min) q = text
  return q
})

const gameOver = () => {
  state.value = 'over'
  cancelAnimationFrame(raf)
  raf = 0
  pointerActive = false
  leftKey = false
  rightKey = false
  if (score.value > best.value) {
    best.value = score.value
    isNewBest.value = true
    if (score.value > 30) burstConfetti({ count: 90 })
    try {
      localStorage.setItem(BEST_KEY, String(best.value))
    } catch {
      // ignore
    }
  }
}

const yToScreen = (worldY: number, H: number, unit: number) =>
  BALL_SCREEN * H - (worldY - cameraY) * unit

/** Draw one shelf, styled by kind. sy is the screen y of its surface. */
const drawShelf = (
  ctx: CanvasRenderingContext2D,
  p: Platform,
  index: number,
  sy: number,
  W: number,
) => {
  const count = bounceCounts.get(index) ?? 0
  const pw = p.width * W
  const px = p.x * W - pw / 2
  let color = '#34d399'
  let alpha = 1
  if (index === 0) color = '#475569'
  else if (p.kind === 'super') color = '#22d3ee'
  else if (p.kind === 'rocket') color = '#fbbf24'
  else if (p.kind === 'crumble') color = '#d97706'
  else if (p.kind === 'fading') {
    color = '#a78bfa'
    alpha = 0.25 + 0.75 * fadeLife(index, p.kind)
  }
  // A shelf one bounce away from breaking warns amber; earlier bounces keep
  // the kind's own color so springs stay readable.
  if (count > 0 && platformBroken(count + 1, p.kind)) color = '#f59e0b'

  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.fillRect(px, sy - 6, pw, 10)
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  ctx.fillRect(px, sy - 6, pw, 3)

  if (p.kind === 'super' || p.kind === 'rocket') {
    // Spring chevrons pointing up so the boost reads at a glance.
    ctx.strokeStyle = p.kind === 'rocket' ? '#fef3c7' : '#cffafe'
    ctx.lineWidth = 2
    const cx = p.x * W
    for (let k = 0; k < (p.kind === 'rocket' ? 3 : 2); k += 1) {
      const cy = sy - 10 - k * 6
      ctx.beginPath()
      ctx.moveTo(cx - 6, cy)
      ctx.lineTo(cx, cy - 5)
      ctx.lineTo(cx + 6, cy)
      ctx.stroke()
    }
    if (p.kind === 'rocket') {
      ctx.shadowColor = '#fbbf24'
      ctx.shadowBlur = 12
      ctx.fillStyle = color
      ctx.fillRect(px, sy - 6, pw, 10)
      ctx.shadowBlur = 0
    }
  } else if (p.kind === 'crumble') {
    // Cracks so it reads as fragile.
    ctx.strokeStyle = 'rgba(60, 30, 5, 0.8)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(px + pw * 0.3, sy - 6)
    ctx.lineTo(px + pw * 0.36, sy + 0)
    ctx.lineTo(px + pw * 0.28, sy + 4)
    ctx.moveTo(px + pw * 0.68, sy - 6)
    ctx.lineTo(px + pw * 0.6, sy - 1)
    ctx.lineTo(px + pw * 0.7, sy + 4)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
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
  ctx.fillStyle = '#0a0f1e'
  ctx.fillRect(0, 0, W, H)

  const unit = H / UNITS_VISIBLE
  const now = performance.now()

  const [lo, hi] = visibleRange()
  for (let i = lo; i <= hi; i += 1) {
    // Bumpers draw independently of their anchor shelf: a bumper must stay
    // visible after the shelf below it breaks or fades (it still collides),
    // and it can be on screen while the shelf is not.
    const b = bump(i)
    if (b.present) {
      const by = yToScreen(b.y, H, unit)
      if (by > -30 && by < H + 30) {
        const bx = b.x * W
        const br = b.r * W
        ctx.fillStyle = '#b91c1c'
        ctx.beginPath()
        ctx.arc(bx, by, br, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#f87171'
        ctx.beginPath()
        ctx.arc(bx - br * 0.25, by - br * 0.25, br * 0.45, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(bx, by, br * 0.55, 0, Math.PI * 2)
        ctx.stroke()
      }
    }

    // Shelves in view (skip any that have broken away or faded out).
    const p = plat(i)
    const sy = yToScreen(p.y, H, unit)
    if (sy < -24 || sy > H + 24) continue
    if (shelfGone(i, p)) continue
    drawShelf(ctx, p, i, sy, W)
  }

  // Trail — a comet tail behind the ball.
  for (let t = 0; t < trail.length; t += 1) {
    const alpha = ((t + 1) / trail.length) * 0.25
    const tx = trail[t].x * W
    const ty = yToScreen(trail[t].y, H, unit)
    ctx.fillStyle = `rgba(244, 114, 182, ${alpha})`
    ctx.beginPath()
    ctx.arc(tx, ty, BALL_RADIUS * W * (0.4 + (0.5 * (t + 1)) / trail.length), 0, Math.PI * 2)
    ctx.fill()
  }

  // Ball with squash & stretch: squashed right after a bounce, stretched when fast.
  const bx = ball.x * W
  const by = yToScreen(ball.y, H, unit)
  const r = BALL_RADIUS * W
  const sinceBounce = now - lastBounceAt
  const squash = sinceBounce < 140 ? 0.3 * (1 - sinceBounce / 140) : 0
  const stretch = Math.min(0.18, Math.abs(ball.vy) * 0.012)
  const rx = r * (1 + squash - stretch * 0.5)
  const ry = r * (1 - squash + stretch)
  ctx.beginPath()
  ctx.ellipse(bx, by, rx, ry, 0, 0, Math.PI * 2)
  ctx.fillStyle = '#f472b6'
  ctx.shadowColor = '#f472b6'
  ctx.shadowBlur = 14
  ctx.fill()
  ctx.shadowBlur = 0

  // Milestone flourish: every 100 height, a brief floating callout.
  if (milestoneShownAt && now - milestoneShownAt < 1100) {
    const t = (now - milestoneShownAt) / 1100
    ctx.globalAlpha = 1 - t
    ctx.fillStyle = '#fbbf24'
    ctx.font = `700 ${Math.round(H * 0.045)}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(`${milestone} ✦`, W / 2, H * 0.22 - t * 24)
    ctx.globalAlpha = 1
  }
}

// Viewport-fraction coordinates of the ball, for aiming a confetti burst at it
// (confetti positions relative to the window, the game relative to its column).
const ballViewportXY = () => {
  const rect = canvasEl.value?.getBoundingClientRect()
  if (!rect || !window.innerWidth || !window.innerHeight) return {}
  return {
    x: (rect.left + ball.x * rect.width) / window.innerWidth,
    y: (rect.top + BALL_SCREEN * rect.height) / window.innerHeight,
  }
}

const tick = (ts: number) => {
  if (state.value !== 'running') return
  const dt = lastTs ? Math.min(48, ts - lastTs) : 16
  lastTs = ts
  runMs += dt

  // Analog steering: the ball chases the finger/cursor; keys push full-tilt.
  const steer = pointerActive
    ? wrapDelta(ball.x, pointerX01) * 9
    : leftKey === rightKey
      ? 0
      : leftKey
        ? -1
        : 1

  const prevY = ball.y
  ball = stepBall(ball, steer, dt)

  trail.push({ x: ball.x, y: ball.y })
  if (trail.length > 9) trail.shift()

  // Bounce off the top of any live shelf the ball crossed downward this step.
  if (ball.vy <= 0) {
    const center = nearestPlatformIndex(ball.y)
    for (let i = Math.max(0, center - 2); i <= center + 2; i += 1) {
      const p = plat(i)
      if (shelfGone(i, p)) continue
      const bounced = tryBounce(ball, prevY, p)
      if (bounced) {
        ball = bounced
        bounceCounts.set(i, (bounceCounts.get(i) ?? 0) + 1)
        lastBounceAt = performance.now()
        // A fading shelf starts dissolving the moment it is first used.
        if (p.kind === 'fading' && !fadeSeen.has(i)) fadeSeen.set(i, runMs)
        if (p.kind === 'rocket') burstConfetti({ count: 40, ...ballViewportXY(), power: 0.7 })
        break
      }
    }
  }

  // Bumpers near the ball knock it away (never lethal, just costly).
  const ci = nearestPlatformIndex(ball.y)
  for (let i = Math.max(0, ci - 2); i <= ci + 2; i += 1) {
    const knocked = bounceOffBumper(ball, bump(i))
    if (knocked) {
      ball = knocked
      break
    }
  }

  maxY.value = trackMaxHeight(maxY.value, ball.y)
  cameraY = Math.max(cameraY, ball.y) // camera only rises

  // Celebrate every 100 climbed.
  const s = heightScore(maxY.value)
  if (s >= milestone + 100) {
    milestone = Math.floor(s / 100) * 100
    milestoneShownAt = performance.now()
  }

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

const pointerTo = (clientX: number, el: HTMLElement) => {
  const rect = el.getBoundingClientRect()
  pointerX01 = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
}

const onPointerDown = (e: PointerEvent) => {
  if (state.value !== 'running') start()
  pointerActive = true
  // Capture the pointer so a mouse released OUTSIDE the canvas still delivers
  // pointerup here — otherwise pointerActive sticks and the ball chases a
  // hovering, unpressed cursor forever.
  try {
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
  } catch {
    // capture unsupported — worst case is the old sticky-pointer behavior
  }
  pointerTo(e.clientX, e.currentTarget as HTMLElement)
}
const onPointerMove = (e: PointerEvent) => {
  if (state.value === 'running' && pointerActive) pointerTo(e.clientX, e.currentTarget as HTMLElement)
}
const stopSteer = () => {
  pointerActive = false
}

const onKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'ArrowLeft' || e.key === 'a') {
    e.preventDefault()
    if (state.value !== 'running') start()
    leftKey = true
  } else if (e.key === 'ArrowRight' || e.key === 'd') {
    e.preventDefault()
    if (state.value !== 'running') start()
    rightKey = true
  }
}
const onKeyUp = (e: KeyboardEvent) => {
  if (e.key === 'ArrowLeft' || e.key === 'a') leftKey = false
  else if (e.key === 'ArrowRight' || e.key === 'd') rightKey = false
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

onMounted(() => {
  try {
    best.value = Number(localStorage.getItem(BEST_KEY)) || 0
  } catch {
    best.value = 0
  }
  reset()
  draw()
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
})
</script>

<template>
  <v-container class="py-6" max-width="720">
    <GameToolbar title="Ball Bounce" shareable @share="share">
      <template #intro>
        The ball bounces on its own — <strong>drag anywhere and it follows your finger</strong>
        (or use the arrow keys) to land on the next shelf. The view only climbs; fall off the
        bottom and it's over.
      </template>
      <template #info>
        <h3>Goal</h3>
        <p>Bounce as high as you can, shelf to shelf, without dropping off the bottom of the screen.</p>
        <h3>Controls</h3>
        <ul>
          <li>Touch or click and drag — the ball steers toward your finger/cursor.</li>
          <li>Desktop: <span class="k">←</span>/<span class="k">→</span> or <span class="k">A</span>/<span class="k">D</span>.</li>
          <li>The ball wraps around the screen edges.</li>
        </ul>
        <h3>Shelves</h3>
        <ul>
          <li><strong>Green</strong> shelves are plain — they break after two bounces (amber = one left).</li>
          <li><strong>Cyan springs</strong> launch you extra high; a rare <strong>golden rocket</strong> launches you very, very high.</li>
          <li><strong>Cracked orange</strong> shelves give a weak bounce and crumble immediately — the next shelf is always still in reach.</li>
          <li><strong>Violet</strong> shelves start dissolving the moment you first bounce on them — a second bounce is a race.</li>
          <li><strong>Red bumpers</strong> knock you sideways and kill your climb — steer around them.</li>
        </ul>
        <h3>Tips</h3>
        <ul>
          <li>Line up the next shelf while you're rising — you can't fix a miss once you're falling past it.</li>
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
          <p class="text-h6 mb-2">Drag to steer the bounces</p>
          <v-btn color="primary" variant="flat" @click="start">Start</v-btn>
        </template>
        <template v-else>
          <p class="text-h5 mb-1">Game over</p>
          <p class="text-body-2 mb-1">
            Height {{ score }}<span v-if="isNewBest && score > 0"> — new best!</span>
          </p>
          <p class="text-caption text-medium-emphasis mb-3">{{ quip }}</p>
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
