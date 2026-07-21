<script setup lang="ts">
/**
 * Ninja Climb — cling to a wall, hold to charge, release to leap to the opposite
 * wall. Hold longer to jump higher. Spikes jut from the walls (land on one and
 * you're done) and rising lava chases you up, so keep climbing. Canvas-rendered;
 * physics/hazards come from services/wallJump. Score is height reached.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import GameToolbar from '@/components/GameToolbar.vue'
import { useSquareFit } from '@/composables/useSquareFit'
import {
  GRAVITY,
  MAX_CHARGE_MS,
  SPIKE_SPACING,
  hitsSpike,
  initialNinja,
  jump,
  predictTrajectory,
  spikeAt,
  stepLava,
  stepNinja,
  type NinjaState,
} from '@/services/wallJump'

const { el: boardEl, px: boardPx } = useSquareFit(150)
const displayW = computed(() => Math.round(boardPx.value * 0.66))
const displayH = computed(() => boardPx.value)

const BEST_KEY = 'walljump-best'
const WALL_THICK = 0.1 // fraction of width
const UNITS_VISIBLE = 6 // climb units shown vertically
const NINJA_SCREEN = 0.62 // ninja's vertical screen position

const canvasEl = ref<HTMLCanvasElement | null>(null)
const state = ref<'idle' | 'running' | 'over'>('idle')
const best = ref(0)
const chargeMs = ref(0)

let ninja: NinjaState = initialNinja()
let seed = 1
let maxY = 0
let dangerY = -4
let elapsedMs = 0 // run time, drives lava acceleration
let cameraY = 0 // lags ninja.y so the jump arc is visible on screen
let charging = false
let chargeStart = 0
let raf = 0
let lastTs = 0
let dying = false // playing the death fall before the game-over screen
let deathMs = 0
let deathVy = 0

const score = computed(() => Math.max(0, Math.round(maxY * 10)))

const reset = () => {
  ninja = initialNinja()
  seed = (Math.floor(Math.random() * 0xffffffff) || 1) >>> 0
  maxY = 0
  dangerY = -4
  elapsedMs = 0
  cameraY = 0
  charging = false
  chargeMs.value = 0
  dying = false
  deathMs = 0
  deathVy = 0
}

const gameOver = () => {
  state.value = 'over'
  cancelAnimationFrame(raf)
  raf = 0
  charging = false
  if (score.value > best.value) {
    best.value = score.value
    try {
      localStorage.setItem(BEST_KEY, String(best.value))
    } catch {
      // ignore
    }
  }
}

const yToScreen = (worldY: number, cameraY: number, H: number, unit: number) =>
  NINJA_SCREEN * H - (worldY - cameraY) * unit

/**
 * Draw a tiny stick-ninja at (cx, cy). `facing` is the wall it clings to
 * (-1 left / +1 right); the figure leans away from that wall and reaches an arm
 * toward it, so you can read which side it's on. `s` is the body scale in px.
 */
const drawNinja = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  facing: -1 | 1,
  airborne: boolean,
) => {
  const f = facing // +1 limbs reach right, -1 reach left
  ctx.save()
  ctx.translate(cx, cy)
  ctx.strokeStyle = '#f8fafc'
  ctx.fillStyle = '#f8fafc'
  ctx.lineWidth = Math.max(1.5, s * 0.22)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.shadowColor = '#38bdf8'
  ctx.shadowBlur = 10

  const headR = s * 0.5
  const headY = -s * 1.35
  // Head
  ctx.beginPath()
  ctx.arc(0, headY, headR, 0, Math.PI * 2)
  ctx.fill()
  // Headband tail streaming away from the wall it faces
  ctx.beginPath()
  ctx.moveTo(-f * headR * 0.6, headY - headR * 0.2)
  ctx.lineTo(-f * headR * 1.9, headY - headR * 0.6)
  ctx.stroke()
  // Body
  const hipY = s * 0.55
  ctx.beginPath()
  ctx.moveTo(0, headY + headR)
  ctx.lineTo(0, hipY)
  ctx.stroke()
  // Arms: one reaches toward the wall (to cling), one out for balance
  const armY = -s * 0.35
  ctx.beginPath()
  ctx.moveTo(0, armY)
  ctx.lineTo(f * s * 1.0, armY + (airborne ? -s * 0.5 : s * 0.15)) // wall-side arm
  ctx.moveTo(0, armY)
  ctx.lineTo(-f * s * 0.85, armY + s * 0.55) // trailing arm
  ctx.stroke()
  // Legs: wall-side leg tucked up when clinging, both trailing when airborne
  ctx.beginPath()
  ctx.moveTo(0, hipY)
  ctx.lineTo(f * s * 0.7, hipY + (airborne ? s * 0.9 : s * 0.5))
  ctx.moveTo(0, hipY)
  ctx.lineTo(-f * s * 0.6, hipY + s * 1.0)
  ctx.stroke()

  ctx.shadowBlur = 0
  ctx.restore()
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
  ctx.fillStyle = '#0b1020'
  ctx.fillRect(0, 0, W, H)

  const unit = H / UNITS_VISIBLE
  const wt = WALL_THICK * W

  // Walls
  ctx.fillStyle = '#1e293b'
  ctx.fillRect(0, 0, wt, H)
  ctx.fillRect(W - wt, 0, wt, H)

  // Spikes near the camera
  const lo = Math.floor((cameraY - 2.5) / SPIKE_SPACING) - 1
  const hi = Math.ceil((cameraY + 4) / SPIKE_SPACING) + 1
  ctx.fillStyle = '#94a3b8'
  for (let i = Math.max(0, lo); i <= hi; i += 1) {
    const spike = spikeAt(seed, i)
    const sy = yToScreen(spike.y, cameraY, H, unit)
    if (sy < -20 || sy > H + 20) continue
    const halfPx = spike.half * unit
    if (spike.side === -1) {
      ctx.beginPath()
      ctx.moveTo(wt, sy - halfPx)
      ctx.lineTo(wt + halfPx * 1.1, sy)
      ctx.lineTo(wt, sy + halfPx)
      ctx.closePath()
      ctx.fill()
    } else {
      ctx.beginPath()
      ctx.moveTo(W - wt, sy - halfPx)
      ctx.lineTo(W - wt - halfPx * 1.1, sy)
      ctx.lineTo(W - wt, sy + halfPx)
      ctx.closePath()
      ctx.fill()
    }
  }

  // Rising lava
  const lavaScreen = yToScreen(dangerY, cameraY, H, unit)
  if (lavaScreen < H) {
    const grad = ctx.createLinearGradient(0, lavaScreen, 0, H)
    grad.addColorStop(0, 'rgba(239, 68, 68, 0.55)')
    grad.addColorStop(1, 'rgba(127, 29, 29, 0.95)')
    ctx.fillStyle = grad
    ctx.fillRect(0, Math.max(0, lavaScreen), W, H - Math.max(0, lavaScreen))
  }

  const nx = ninja.x * W
  const ny = yToScreen(ninja.y, cameraY, H, unit)

  // Charge arc preview: a dashed predicted trajectory that grows with the hold.
  if (charging && !ninja.airborne) {
    const path = predictTrajectory(ninja, chargeMs.value)
    if (path.length > 1) {
      ctx.save()
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.85)'
      ctx.lineWidth = 2
      ctx.setLineDash([4, 6])
      ctx.beginPath()
      for (let i = 0; i < path.length; i += 1) {
        const px = path[i].x * W
        const py = yToScreen(path[i].y, cameraY, H, unit)
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.stroke()
      ctx.setLineDash([])
      // Landing marker at the end of the arc.
      const end = path[path.length - 1]
      ctx.fillStyle = 'rgba(34, 211, 238, 0.9)'
      ctx.beginPath()
      ctx.arc(end.x * W, yToScreen(end.y, cameraY, H, unit), 3.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  }

  // Ninja figure, oriented to the wall it clings to (or last leaned toward).
  drawNinja(ctx, nx, ny, 0.05 * W, ninja.side, ninja.airborne || dying)

  // Charge meter (while holding, grounded)
  if (charging && !ninja.airborne) {
    const t = Math.min(1, chargeMs.value / MAX_CHARGE_MS)
    const barH = 0.18 * H * t
    ctx.fillStyle = '#22d3ee'
    ctx.fillRect(nx - 4, ny - 0.11 * W - barH - 6, 8, barH)
  }
}

// Detach the ninja and let it tumble down for a beat before the game-over card.
const startDeath = () => {
  dying = true
  deathMs = 0
  deathVy = 0
  ninja = { ...ninja, airborne: true, vx: 0 }
}

const tick = (ts: number) => {
  if (state.value !== 'running') return
  const dt = lastTs ? Math.min(48, ts - lastTs) : 16
  lastTs = ts

  if (dying) {
    deathMs += dt
    deathVy += (GRAVITY * dt) / 1000
    ninja = { ...ninja, y: ninja.y - (deathVy * dt) / 1000 }
    cameraY += (ninja.y - cameraY) * Math.min(1, (dt / 1000) * 4)
    draw()
    if (deathMs > 650) {
      gameOver()
      return
    }
    raf = requestAnimationFrame(tick)
    return
  }

  if (charging && !ninja.airborne) chargeMs.value = ts - chargeStart

  ninja = stepNinja(ninja, dt)
  if (ninja.y > maxY) maxY = ninja.y
  // Ease the camera toward the ninja so the jump arc is visible before it recenters.
  cameraY += (ninja.y - cameraY) * Math.min(1, (dt / 1000) * 5)

  // Lava rises, accelerating the longer the run lasts.
  elapsedMs += dt
  dangerY = stepLava(dangerY, elapsedMs, dt)

  // Fly into (or land on) a spike and the ninja falls to its death.
  if (hitsSpike(ninja, seed)) {
    startDeath()
    draw()
    raf = requestAnimationFrame(tick)
    return
  }
  if (ninja.y <= dangerY) {
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

const beginCharge = (ts: number) => {
  if (state.value !== 'running') {
    start()
  }
  if (!ninja.airborne) {
    charging = true
    chargeStart = ts
    chargeMs.value = 0
  }
}
const releaseCharge = (ts: number) => {
  if (state.value !== 'running' || !charging) return
  charging = false
  if (!ninja.airborne) {
    ninja = jump(ninja, ts - chargeStart)
    chargeMs.value = 0
  }
}

const onPointerDown = (e: PointerEvent) => beginCharge(e.timeStamp)
const onPointerUp = (e: PointerEvent) => releaseCharge(e.timeStamp)

const onKeyDown = (e: KeyboardEvent) => {
  if (e.key === ' ' && !e.repeat) {
    e.preventDefault()
    beginCharge(e.timeStamp)
  }
}
const onKeyUp = (e: KeyboardEvent) => {
  if (e.key === ' ') {
    e.preventDefault()
    releaseCharge(e.timeStamp)
  }
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
  <v-container class="py-6" max-width="600">
    <GameToolbar title="Ninja Climb">
      <template #intro>
        Cling to a wall, <strong>hold</strong> to charge, and release to leap to the other wall —
        hold longer to jump higher. Dodge the spikes and outrun the rising lava. Hold Space on desktop.
      </template>
      <template #info>
        <h3>Goal</h3>
        <p>Climb as high as you can, wall to wall, without landing on a spike or letting the lava catch you.</p>
        <h3>Controls</h3>
        <ul>
          <li>Press and hold anywhere (or <span class="k">Space</span>) to charge a jump.</li>
          <li>Release to leap to the opposite wall — a longer hold jumps higher.</li>
        </ul>
        <h3>Tips</h3>
        <ul>
          <li>Judge your charge so you land above the next spike, not into it.</li>
          <li>The lava speeds up the higher you get — don't dawdle on a wall.</li>
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
        @pointerup.prevent="onPointerUp"
      />
      <div v-if="state !== 'running'" class="overlay">
        <template v-if="state === 'idle'">
          <p class="text-h6 mb-2">Hold to charge, release to jump</p>
          <v-btn color="primary" variant="flat" @click="start">Start</v-btn>
        </template>
        <template v-else>
          <p class="text-h5 mb-1">Caught!</p>
          <p class="text-body-2 mb-3">
            Height {{ score }}<span v-if="score === best && score > 0"> — new best!</span>
          </p>
          <v-btn color="primary" variant="flat" prepend-icon="mdi-restart" @click="start">Climb again</v-btn>
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
  padding: 0 16px;
  background: rgba(2, 6, 23, 0.7);
  backdrop-filter: blur(2px);
}
</style>
