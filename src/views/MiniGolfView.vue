<script setup lang="ts">
/**
 * Mini Golf — a 9-hole seeded course. Drag anywhere and pull back to aim and set
 * power (like a slingshot), release to putt. Bounce off walls, dodge water,
 * sand, sweeping walls and drop-offs — or hit a jump ramp at speed and fly over
 * the lot. Sink the ball in the cup in as few strokes as possible; score is
 * total strokes vs par. Physics and hole layouts come from services/miniGolf;
 * the sim runs in fixed substeps to avoid tunnelling through thin walls.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import GameToolbar from '@/components/GameToolbar.vue'
import { copyToClipboard } from '@/services/share'
import { mulberry32, randomSeed, strToSeed } from '@/services/seed'
import { burstConfetti } from '@/services/confetti'
import { useViewportFit } from '@/composables/useViewportFit'
import {
  BALL_RADIUS,
  COURSE_HOLES,
  WORLD_H,
  airborne,
  atRest,
  courseResult,
  effectiveWalls,
  holeResult,
  inCup,
  inVoid,
  inWater,
  makeHole,
  moverRectAt,
  planPutt,
  step,
  type BallState,
  type Hole,
  type Result,
} from '@/services/miniGolf'

// Portrait board (1 × WORLD_H): phones have spare height, and the enforced side
// margins leave the finger somewhere to go on a horizontal pull-back near a
// side wall — the whole reason the board isn't a square. Height derives from
// width (the fit's own h can disagree by a rounding pixel) so boardW is the one
// source of truth: one watch, no stale canvas on height-only viewport shifts.
const { el: boardEl, w: boardW } = useViewportFit(1 / WORLD_H, 36, 44)
const boardH = computed(() => Math.round(boardW.value * WORLD_H))

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
const phase = ref<'aim' | 'rolling' | 'sinking' | 'holed' | 'done'>('aim')
const snackbar = ref(false)
const holeMsg = ref<Result | null>(null)
const courseMsg = ref<Result | null>(null)
const flashMsg = ref('') // transient "Splash!" / "Off the edge!" banner

// Speed-run clock: play time for the whole course (aiming counts, the
// between-holes scorecard doesn't). Starts with the first putt.
const elapsedMs = ref(0)
const bestLabel = ref('') // stored course record for this seed
const isNewRecord = ref(false)
const timeLabel = computed(() => {
  const s = Math.floor(elapsedMs.value / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
})
const fmtMs = (ms: number) => {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const timing = () => totalStrokes.value > 0 || strokes.value > 0

// --- Per-hole records + practice mode ------------------------------------
// Each hole's best (fastest, with its stroke count) is kept per course seed,
// recorded on every sink — course play or practice. The holes menu jumps
// straight into any hole to chase a time; Back to course restores the round
// exactly where it was left.
interface HoleBest {
  ms: number
  strokes: number
}
const holeBests = ref<Array<HoleBest | null>>(new Array(COURSE_HOLES).fill(null))
const coursePars = ref<number[]>([])
let holeStartMs = 0 // elapsedMs when the current hole started

const holesKey = () => `golf-holes:${seedCode.value}`
const loadHoleBests = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(holesKey()) ?? 'null') as Array<HoleBest | null> | null
    holeBests.value =
      Array.isArray(raw) && raw.length === COURSE_HOLES ? raw : new Array(COURSE_HOLES).fill(null)
  } catch {
    holeBests.value = new Array(COURSE_HOLES).fill(null)
  }
}
const recordHoleBest = (ms: number, strokeCount: number): { prev: HoleBest | null; improved: boolean } => {
  const prev = holeBests.value[holeIndex.value]
  const improved = !prev || ms < prev.ms
  if (improved) {
    holeBests.value[holeIndex.value] = { ms, strokes: strokeCount }
    try {
      localStorage.setItem(holesKey(), JSON.stringify(holeBests.value))
    } catch {
      // ignore
    }
  }
  return { prev, improved }
}

const practice = ref(false)
const practiceResult = ref<{ ms: number; strokes: number; prev: HoleBest | null; improved: boolean } | null>(null)
let courseSnapshot: {
  holeIndex: number
  totalStrokes: number
  totalPar: number
  elapsedMs: number
  done: boolean
  courseMsg: Result | null
} | null = null

const practiceHole = (i: number) => {
  if (!practice.value) {
    courseSnapshot = {
      holeIndex: holeIndex.value,
      totalStrokes: totalStrokes.value,
      totalPar: totalPar.value,
      elapsedMs: elapsedMs.value,
      done: phase.value === 'done',
      courseMsg: courseMsg.value,
    }
  }
  practice.value = true
  practiceResult.value = null
  holeIndex.value = i
  elapsedMs.value = 0
  loadHole()
}
const retryPractice = () => practiceHole(holeIndex.value)
const backToCourse = () => {
  const s = courseSnapshot
  practice.value = false
  practiceResult.value = null
  courseSnapshot = null
  if (!s) return
  holeIndex.value = s.holeIndex
  totalStrokes.value = s.totalStrokes
  totalPar.value = s.totalPar
  courseMsg.value = s.courseMsg
  loadHole()
  elapsedMs.value = s.elapsedMs
  if (s.done) {
    phase.value = 'done'
    stopLoop()
  }
}

let hole: Hole = makeHole(0, 'init')
let ball: BallState = { p: { ...hole.start }, v: { x: 0, y: 0 }, air: 0 }
let raf = 0
let lastTs = 0
let acc = 0
let simMs = 0 // clock for moving obstacles
let airTotal = 0 // ms of the current jump, for the arc animation

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
  ball = { p: { ...hole.start }, v: { x: 0, y: 0 }, air: 0 }
  strokes.value = 0
  phase.value = 'aim'
  aiming = false
  holeMsg.value = null
  simMs = 0
  airTotal = 0
  holeStartMs = elapsedMs.value
  startLoop()
}

// A wobbly, hand-drawn-feeling closed blob: a circle whose radius breathes
// with a couple of seeded sine harmonics. Collision stays the true circle; the
// wobble is kept small so the visual edge never lies by more than ~8%.
const blobPath = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  wobbleSeed: number,
  amp = 0.08,
) => {
  const rand = mulberry32(wobbleSeed >>> 0)
  const p1 = rand() * Math.PI * 2
  const p2 = rand() * Math.PI * 2
  const a1 = amp * (0.6 + rand() * 0.4)
  const a2 = amp * 0.6 * (0.5 + rand() * 0.5)
  ctx.beginPath()
  const N = 28
  for (let i = 0; i <= N; i += 1) {
    const th = (i / N) * Math.PI * 2
    const rr = r * (1 + a1 * Math.sin(3 * th + p1) + a2 * Math.sin(5 * th + p2))
    const x = cx + Math.cos(th) * rr
    const y = cy + Math.sin(th) * rr
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

const wobbleSeedFor = (x: number, y: number) =>
  (Math.round(x * 8191) * 127 + Math.round(y * 8191)) >>> 0

// A jagged straight edge from (x1,y1) to (x2,y2): little seeded perpendicular
// offsets every few pixels, like torn turf.
const jaggedLine = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rand: () => number,
  amp = 3,
) => {
  const len = Math.hypot(x2 - x1, y2 - y1)
  const steps = Math.max(2, Math.round(len / 9))
  const nx = -(y2 - y1) / (len || 1)
  const ny = (x2 - x1) / (len || 1)
  ctx.moveTo(x1, y1)
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps
    const off = i === steps ? 0 : (rand() - 0.5) * 2 * amp
    ctx.lineTo(x1 + (x2 - x1) * t + nx * off, y1 + (y2 - y1) * t + ny * off)
  }
}

const draw = () => {
  const canvas = canvasEl.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  const S = boardW.value // px per world unit (world is 1 wide × WORLD_H tall)
  const H = boardH.value
  // Round the backing-store size: comparing against fractional S*dpr (Android
  // dprs like 2.625) would mismatch the stored integer and re-allocate the
  // bitmap on every frame.
  const pw = Math.round(S * dpr)
  const ph = Math.round(H * dpr)
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw
    canvas.height = ph
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  // Turf: base green with seeded organic mottling instead of ruled stripes —
  // soft light/dark patches like real (imperfectly mowed) grass.
  ctx.fillStyle = '#166534'
  ctx.fillRect(0, 0, S, H)
  const turf = mulberry32((strToSeed(hole.seed) + hole.index * 7919) >>> 0)
  for (let i = 0; i < 16; i += 1) {
    const bx = turf() * S
    const by = turf() * H
    const br = (0.06 + turf() * 0.12) * S
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.05)'
    ctx.beginPath()
    ctx.ellipse(bx, by, br * (0.8 + turf() * 0.6), br, turf() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }

  // Shape cuts — the course outline itself. Outside is just... not course:
  // page-dark, with a timber rail along every face that borders grass (you
  // bank off these exactly like the outer walls).
  for (const c of hole.cuts) {
    const cx0 = c.x * S
    const cy0 = c.y * S
    const cw = c.w * S
    const ch = c.h * S
    ctx.fillStyle = '#0a0f1e'
    ctx.fillRect(cx0, cy0, cw, ch)
    const rail = Math.max(4, S * 0.012)
    ctx.fillStyle = '#5b3a1e'
    if (c.x > 0.001) ctx.fillRect(cx0 - 1, cy0, rail, ch) // left face exposed
    if (c.x + c.w < 0.999) ctx.fillRect(cx0 + cw - rail + 1, cy0, rail, ch) // right face
    if (c.y > 0.001) ctx.fillRect(cx0, cy0 - 1, cw, rail) // top face
    if (c.y + c.h < WORLD_H - 0.001) ctx.fillRect(cx0, cy0 + ch - rail + 1, cw, rail) // bottom face
    // A grain line along the longest exposed rail for the hand-laid look.
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'
    ctx.lineWidth = 1
    if (ch >= cw && (c.x > 0.001 || c.x + c.w < 0.999)) {
      const rx = c.x > 0.001 ? cx0 + rail * 0.45 : cx0 + cw - rail * 0.45
      ctx.beginPath()
      ctx.moveTo(rx, cy0 + 3)
      ctx.lineTo(rx, cy0 + ch - 3)
      ctx.stroke()
    } else if (c.y > 0.001 || c.y + c.h < WORLD_H - 0.001) {
      const ry = c.y > 0.001 ? cy0 + rail * 0.45 : cy0 + ch - rail * 0.45
      ctx.beginPath()
      ctx.moveTo(cx0 + 3, ry)
      ctx.lineTo(cx0 + cw - 3, ry)
      ctx.stroke()
    }
  }

  // Voids — the green simply isn't there: a dark drop behind a torn-turf edge,
  // with a few cracks running off into the grass.
  for (const v of hole.voids) {
    const vx = v.x * S
    const vy = v.y * S
    const vw = v.w * S
    const vh = v.h * S
    const rand = mulberry32(wobbleSeedFor(v.x + v.w, v.y + v.h))
    ctx.fillStyle = '#050810'
    ctx.fillRect(vx, vy, vw, vh)
    const grad = ctx.createLinearGradient(vx, vy, vx, vy + Math.min(18, vh))
    grad.addColorStop(0, 'rgba(2, 6, 23, 0.0)')
    grad.addColorStop(1, 'rgba(2, 6, 23, 0.55)')
    ctx.fillStyle = grad
    ctx.fillRect(vx, vy, vw, Math.min(18, vh))
    // Torn edge along the whole rim
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.55)'
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.beginPath()
    jaggedLine(ctx, vx, vy, vx + vw, vy, rand)
    jaggedLine(ctx, vx + vw, vy, vx + vw, vy + vh, rand)
    jaggedLine(ctx, vx + vw, vy + vh, vx, vy + vh, rand)
    jaggedLine(ctx, vx, vy + vh, vx, vy, rand)
    ctx.stroke()
    // Cracks creeping into the turf
    ctx.strokeStyle = 'rgba(5, 8, 16, 0.5)'
    ctx.lineWidth = 1.5
    for (let c = 0; c < 3; c += 1) {
      const along = rand()
      const side = rand() < 0.5
      const sx = side ? vx + vw * along : vx + (rand() < 0.5 ? 0 : vw)
      const sy = side ? vy + (rand() < 0.5 ? 0 : vh) : vy + vh * along
      const dx = (rand() - 0.5) * 22
      const dy = (rand() - 0.5) * 22
      ctx.beginPath()
      ctx.moveTo(sx, sy)
      ctx.lineTo(sx + dx, sy + dy)
      ctx.lineTo(sx + dx * 1.6 + (rand() - 0.5) * 8, sy + dy * 1.6 + (rand() - 0.5) * 8)
      ctx.stroke()
    }
  }

  // Sand — pale organic blobs with speckles and a soft inner shadow.
  for (const hz of hole.hazards) {
    if (hz.kind !== 'sand') continue
    const hx = hz.p.x * S
    const hy = hz.p.y * S
    const hr = hz.r * S
    const wseed = wobbleSeedFor(hz.p.x, hz.p.y)
    blobPath(ctx, hx, hy, hr, wseed)
    ctx.fillStyle = '#d6b98c'
    ctx.fill()
    blobPath(ctx, hx + hr * 0.06, hy + hr * 0.08, hr * 0.8, wseed + 1, 0.1)
    ctx.strokeStyle = 'rgba(120, 90, 40, 0.3)'
    ctx.lineWidth = 1.5
    ctx.stroke()
    const rand = mulberry32(wseed + 2)
    ctx.fillStyle = 'rgba(120, 90, 40, 0.45)'
    for (let k = 0; k < 8; k += 1) {
      const a = rand() * Math.PI * 2
      const rr = hr * (0.15 + rand() * 0.6)
      ctx.fillRect(hx + Math.cos(a) * rr, hy + Math.sin(a) * rr, 2, 2)
    }
  }

  // Water pools — layered organic blobs, darker shore ring, light ripple.
  for (const hz of hole.hazards) {
    if (hz.kind !== 'water') continue
    const hx = hz.p.x * S
    const hy = hz.p.y * S
    const hr = hz.r * S
    const wseed = wobbleSeedFor(hz.p.x, hz.p.y)
    blobPath(ctx, hx, hy, hr, wseed)
    ctx.fillStyle = '#0c4a6e'
    ctx.fill()
    ctx.lineWidth = 2.5
    ctx.strokeStyle = 'rgba(8, 47, 73, 0.9)'
    ctx.stroke()
    blobPath(ctx, hx - hr * 0.05, hy - hr * 0.05, hr * 0.68, wseed + 3, 0.12)
    ctx.fillStyle = '#075985'
    ctx.fill()
    // A couple of ripple glints
    const rand = mulberry32(wseed + 4)
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.35)'
    ctx.lineWidth = 1.2
    for (let k = 0; k < 2; k += 1) {
      const a = rand() * Math.PI * 2
      const rr = hr * (0.25 + rand() * 0.35)
      ctx.beginPath()
      ctx.arc(hx, hy, rr, a, a + 0.9 + rand())
      ctx.stroke()
    }
  }

  // Jump ramps — an amber pad whose chevrons point where the KICKER fires
  // (not necessarily at the flag — read it before you trust it).
  for (const ramp of hole.ramps) {
    const rx = ramp.rect.x * S
    const ry = ramp.rect.y * S
    const rw = ramp.rect.w * S
    const rh = ramp.rect.h * S
    const cx = rx + rw / 2
    const cy = ry + rh / 2
    blobPath(ctx, cx, cy, Math.min(rw, rh) * 0.72, wobbleSeedFor(ramp.rect.x, ramp.rect.y), 0.06)
    ctx.fillStyle = '#b45309'
    ctx.fill()
    blobPath(ctx, cx, cy, Math.min(rw, rh) * 0.6, wobbleSeedFor(ramp.rect.x, ramp.rect.y) + 1, 0.06)
    ctx.fillStyle = '#f59e0b'
    ctx.fill()
    // Chevrons rotated to the launch direction.
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(Math.atan2(ramp.dir.y, ramp.dir.x) + Math.PI / 2)
    ctx.strokeStyle = '#fffbeb'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    const cw = Math.min(rw, rh) * 0.34
    for (let k = 0; k < 2; k += 1) {
      const oy = rh * (0.2 - k * 0.28)
      ctx.beginPath()
      ctx.moveTo(-cw, oy)
      ctx.lineTo(0, oy - rh * 0.22)
      ctx.lineTo(cw, oy)
      ctx.stroke()
    }
    ctx.restore()
  }

  // Timber walls: rounded ends, per-wall shade variation, a grain line — reads
  // as laid lumber rather than plotted rectangles. (Physics is still the AABB;
  // the rounding is within a pixel or two.)
  const timber = (r: { x: number; y: number; w: number; h: number }, i: number, live: boolean) => {
    const wx = r.x * S
    const wy = r.y * S
    const ww = r.w * S
    const wh = r.h * S
    const shades = live ? ['#a16207', '#b45309'] : ['#5b3a1e', '#6b4423', '#52351c']
    ctx.fillStyle = shades[i % shades.length]
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath()
      ctx.roundRect(wx, wy, ww, wh, Math.min(4, wh / 2, ww / 2))
      ctx.fill()
    } else {
      ctx.fillRect(wx, wy, ww, wh)
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'
    ctx.lineWidth = 1
    ctx.beginPath()
    if (ww >= wh) {
      ctx.moveTo(wx + 4, wy + wh * 0.62)
      ctx.lineTo(wx + ww - 4, wy + wh * 0.58)
    } else {
      ctx.moveTo(wx + ww * 0.62, wy + 4)
      ctx.lineTo(wx + ww * 0.58, wy + wh - 4)
    }
    ctx.stroke()
  }
  hole.walls.forEach((w, i) => timber(w, i, false))
  hole.movers.forEach((m, i) => timber(moverRectAt(m, simMs), i, true))

  // Cup + flag. The black circle is the REAL capture zone — what you see is
  // what sinks. Barely bigger than the ball.
  const cx = hole.cup.x * S
  const cy = hole.cup.y * S
  const cr = hole.cupRadius * S
  ctx.beginPath()
  ctx.arc(cx + 1, cy + 1.5, cr * 1.08, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0,0,0,0.25)' // soft lip shadow
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx, cy, cr, 0, Math.PI * 2)
  ctx.fillStyle = '#0b1020'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx, cy, cr, -2.4, 0.6) // crescent highlight on the rim
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.6)'
  ctx.lineWidth = 1.4
  ctx.stroke()
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

  // Ball. While sinking it shrinks into the cup; while airborne it arcs up
  // (bigger, with a detached shadow) so the jump reads instantly.
  const sink = phase.value === 'sinking' ? Math.min(1, sinkT) : 0
  const air = ball.air ?? 0
  const jump = airTotal > 0 && air > 0 ? Math.sin(Math.PI * (1 - air / airTotal)) : 0
  const bpx = (ball.p.x + (hole.cup.x - ball.p.x) * sink) * S
  const bpy = (ball.p.y + (hole.cup.y - ball.p.y) * sink) * S
  const br = Math.max(0.5, BALL_RADIUS * S * (1 - 0.85 * sink) * (1 + 0.8 * jump))
  if (jump > 0) {
    ctx.beginPath()
    ctx.ellipse(bpx, bpy + 4 + jump * 10, br * 0.9, br * 0.45, 0, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fill()
  }
  ctx.beginPath()
  ctx.arc(bpx, bpy - jump * S * 0.045, br, 0, Math.PI * 2)
  ctx.fillStyle = '#f8fafc'
  ctx.shadowColor = 'rgba(0,0,0,0.4)'
  ctx.shadowBlur = 6
  ctx.fill()
  ctx.shadowBlur = 0
}

let sinkT = 0 // 0..1 progress of the ball-drop animation

// The ball found the cup: play the short drop animation, then score the hole.
const beginSink = () => {
  phase.value = 'sinking'
  sinkT = 0
  aiming = false
  detachDrag()
}

const holed = () => {
  phase.value = 'holed'
  stopLoop()
  const holeMs = elapsedMs.value - holeStartMs
  const best = recordHoleBest(holeMs, strokes.value)
  if (practice.value) {
    // Practice sinks don't touch the course card — they chase the hole record.
    practiceResult.value = { ms: holeMs, strokes: strokes.value, ...best }
    if (best.improved && best.prev) burstConfetti({ count: 90 })
    draw()
    return
  }
  totalStrokes.value += strokes.value
  totalPar.value += hole.par
  holeMsg.value = holeResult(strokes.value, hole.par)
  // Celebrate the great ones: an ace gets the works, an eagle a burst.
  const diff = strokes.value - hole.par
  if (strokes.value === 1) burstConfetti({ count: 160, power: 1.2 })
  else if (diff <= -2) burstConfetti({ count: 90 })
  draw()
}

// The ball is gone (water or off the edge): back to the tee. The swing is
// already spent, so this costs the player without a phantom stroke.
const resetToTee = (message: string) => {
  ball = { p: { ...hole.start }, v: { x: 0, y: 0 }, air: 0 }
  airTotal = 0
  phase.value = 'aim'
  aiming = false
  detachDrag()
  flashMsg.value = message
  clearTimeout(flashTimer)
  flashTimer = window.setTimeout(() => (flashMsg.value = ''), 1300)
}

// One continuous loop: moving obstacles animate every frame; physics advances
// the WHOLE time the ball is rolling — including while the player is mid-aim, so
// touching a rolling ball never stops it and the sink check always runs. A swing
// simply redirects the still-moving ball from its current spot on release.
const loop = (ts: number) => {
  const dt = lastTs ? Math.min(48, ts - lastTs) : STEP_MS
  lastTs = ts
  simMs += dt
  if (timing() && phase.value !== 'holed' && phase.value !== 'done') elapsedMs.value += dt

  if (phase.value === 'rolling') {
    acc += dt
    while (acc >= STEP_MS) {
      const wasAirborne = airborne(ball)
      ball = step(ball, effectiveWalls(hole, simMs), STEP_MS, hole)
      acc -= STEP_MS
      if (!wasAirborne && airborne(ball)) airTotal = ball.air ?? 0 // jump just launched
      if (airborne(ball)) continue // flying: nothing on the ground can touch it
      if (inVoid(ball, hole)) {
        resetToTee('Off the edge! Back to the tee')
        break
      }
      if (inWater(ball, hole)) {
        resetToTee('Splash! Back to the tee')
        break
      }
      if (inCup(ball, hole)) {
        beginSink()
        break
      }
    }
    if (phase.value === 'rolling' && atRest(ball)) {
      ball.v = { x: 0, y: 0 }
      phase.value = 'aim'
    }
  } else if (phase.value === 'sinking') {
    sinkT += dt / 300
    if (sinkT >= 1) {
      holed()
      return
    }
  }

  draw()
  if (phase.value === 'aim' || phase.value === 'rolling' || phase.value === 'sinking')
    raf = requestAnimationFrame(loop)
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

// The one pointer that owns the current drag; other pointers (a second finger on
// a touchscreen) are ignored so they can't hijack the aim or fire a stray shot.
let activePointerId: number | null = null

// While dragging, track the pointer on the window so aim + power keep updating
// (and the putt still registers) even when the pointer leaves the play area.
const detachDrag = () => {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
  activePointerId = null
}

const onPointerDown = (e: PointerEvent) => {
  // A swing is allowed while the ball is still rolling. The ball keeps moving
  // during the aim (physics never pauses); on release the shot redirects it from
  // wherever it is. `aiming` only controls the aim overlay + drag capture.
  if (phase.value !== 'aim' && phase.value !== 'rolling') return
  if (aiming) return // already dragging with another pointer — ignore extra touches
  aiming = true
  activePointerId = e.pointerId
  dragStart = pointerPos(e)
  dragCur = { ...dragStart }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
}
function onPointerMove(e: PointerEvent) {
  if (!aiming || e.pointerId !== activePointerId) return
  dragCur = pointerPos(e)
  draw()
}
function onPointerUp(e: PointerEvent) {
  if (!aiming || e.pointerId !== activePointerId) return
  aiming = false
  detachDrag()
  const putt = planPutt(
    { x: dragCur.x - dragStart.x, y: dragCur.y - dragStart.y },
    boardW.value,
    MAX_DRAG_FRAC,
  )
  // A cancel (tiny drag) — or an interaction that resolved into a non-playable
  // phase (holed/done) — is a pure no-op: the ball is never touched, so a rolling
  // ball keeps rolling exactly as before. A mid-air ball can't be steered either.
  if (!putt.counts || airborne(ball) || (phase.value !== 'aim' && phase.value !== 'rolling')) {
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
    // Course record for this seed: fastest time wins (it's a speed run);
    // strokes ride along for bragging rights.
    isNewRecord.value = false
    try {
      const key = `golf-best:${seedCode.value}`
      const prev = JSON.parse(localStorage.getItem(key) ?? 'null') as
        | { ms: number; strokes: number }
        | null
      if (!prev || elapsedMs.value < prev.ms) {
        localStorage.setItem(key, JSON.stringify({ ms: elapsedMs.value, strokes: totalStrokes.value }))
        isNewRecord.value = Boolean(prev)
        bestLabel.value = ''
      } else {
        bestLabel.value = `${fmtMs(prev.ms)} · ${prev.strokes} strokes`
      }
    } catch {
      bestLabel.value = ''
    }
    if (totalStrokes.value <= totalPar.value || isNewRecord.value) burstConfetti({ count: 140, power: 1.1 })
    return
  }
  holeIndex.value += 1
  loadHole()
}

// Fresh attempt at the SAME course — chase the record.
const replayCourse = () => {
  practice.value = false
  practiceResult.value = null
  courseSnapshot = null
  holeIndex.value = 0
  totalStrokes.value = 0
  totalPar.value = 0
  elapsedMs.value = 0
  isNewRecord.value = false
  bestLabel.value = ''
  loadHole()
}

// Pars for the holes menu — computed once per course, off the critical path.
const loadCourseMeta = () => {
  coursePars.value = []
  const seed = seedCode.value
  setTimeout(() => {
    if (seed !== seedCode.value) return // course changed meanwhile
    const pars: number[] = []
    for (let i = 0; i < COURSE_HOLES; i += 1) pars.push(makeHole(i, seed).par)
    coursePars.value = pars
  }, 60)
}

const newCourse = () => {
  seedCode.value = randomSeed()
  router.replace({ name: 'mini-golf', params: { seed: seedCode.value } })
  loadHoleBests()
  loadCourseMeta()
  replayCourse()
}

const share = async () => {
  const url = window.location.origin + `/mini-golf/${seedCode.value}`
  await copyToClipboard(`Play this 9-hole mini golf course:\n${url}`)
  snackbar.value = true
}

watch(boardW, draw)

onMounted(() => {
  const p = typeof route.params.seed === 'string' ? route.params.seed : ''
  seedCode.value = p || randomSeed()
  if (!p) router.replace({ name: 'mini-golf', params: { seed: seedCode.value } })
  loadHoleBests()
  loadCourseMeta()
  loadHole()
  if (import.meta.env.DEV) {
    // Playtest hooks (dev builds only): jump straight to a hole; read live state.
    const w = window as unknown as Record<string, unknown>
    w.__golfSkip = (i: number) => {
      holeIndex.value = Math.max(0, Math.min(COURSE_HOLES - 1, i))
      loadHole()
    }
    w.__golfState = () => ({
      ball: { ...ball.p },
      holeIndex: holeIndex.value,
      phase: phase.value,
      strokes: strokes.value,
    })
  }
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
          Drag and pull back to aim and set power — like a slingshot — then release to putt. Bank off
          the walls, dodge water, sand and drop-offs (or jump them off a ramp), and sink the ball in
          as few strokes as you can, across nine holes.
        </template>
        <template #settings>
          <div class="d-flex flex-column ga-2">
            <v-btn variant="tonal" color="primary" prepend-icon="mdi-timer-refresh-outline" @click="replayCourse">Replay course</v-btn>
            <v-btn variant="tonal" prepend-icon="mdi-refresh" @click="newCourse">New course</v-btn>
          </div>
        </template>
        <template #info>
          <h3>Goal</h3>
          <p>Sink the ball in each cup using as few strokes as possible. Your score is total strokes against the course par.</p>
          <h3>Controls</h3>
          <ul>
            <li>Press and drag <em>away</em> from the direction you want to putt — a longer drag means more power.</li>
            <li>Release to shoot. A tiny drag cancels.</li>
            <li>You can swing again while the ball is still rolling (it costs a stroke) — but not while it's mid-air.</li>
          </ul>
          <h3>Speed run</h3>
          <ul>
            <li>The clock starts on your first putt and runs while you play (it pauses on the scorecards). Fastest time for a course is saved as its record — strokes are only half the game.</li>
            <li><span class="k">Replay course</span> restarts the same nine to chase the record; <span class="k">New course</span> deals a fresh one.</li>
            <li>The <span class="k">Holes</span> menu shows your best time, strokes and par for each hole — tap one to jump in and practice it, then hop back to the round exactly where you left it (an unfinished hole restarts).</li>
          </ul>
          <h3>The course</h3>
          <ul>
            <li>From hole 2 the straight line to the cup is always blocked — read the walls and play the banks.</li>
            <li>Every course deals the full deck of shapes across its nine greens: an L, a donut, a figure-eight, a serpent, a W, an hourglass pinch and an amoeba. Timber-railed edges bounce like any wall; torn dark edges are drop-offs.</li>
            <li><strong>Water</strong> (blue) swallows the ball: back to the tee, swing spent.</li>
            <li><strong>Sand</strong> (tan) drags hard — momentum goes there to die.</li>
            <li><strong>Sweeping timber</strong> slides across the green; time your shot.</li>
            <li><strong>Drop-offs</strong> (dark, dashed edge) are missing green — roll in and you fall off, back to the tee. You can't bank off a rail that's fallen away.</li>
            <li><strong>Jump ramps</strong> (amber pads): cross one fast and the ball launches <em>where the chevrons point</em> — over walls, water, everything — until it lands. They rarely point at the flag; read the kicker before you trust it. A slow roll just trundles across.</li>
            <li>The cup is barely bigger than the ball, and tightens as the course goes on. Pass dead over the hole and the ball drops at any speed — but a hot ball grazing the edge lips out.</li>
          </ul>
          <h3>Tips</h3>
          <ul>
            <li>A ramp whose chevrons line up with the flag is the risky ace route — most don't, but they can still fly you past trouble.</li>
            <li>Ease off near the hole — a hot ball skates across the cup.</li>
            <li>Sand isn't always the enemy: it can catch a ball that would otherwise roll into water.</li>
          </ul>
        </template>
      </GameToolbar>

      <!-- HUD -->
      <div class="d-flex align-center ga-3 mb-3 flex-wrap">
        <div class="text-h6">Hole {{ holeIndex + 1 }}<span class="text-medium-emphasis text-body-2">/{{ COURSE_HOLES }}</span></div>
        <v-chip size="small" variant="tonal">Par {{ par }}</v-chip>
        <v-chip v-if="practice" size="small" color="secondary" variant="flat">Practice</v-chip>
        <div class="text-body-2">Strokes: <span class="font-weight-bold">{{ strokes }}</span></div>
        <v-spacer />
        <div class="text-body-2 font-weight-bold tabular"><v-icon icon="mdi-timer-outline" size="small" /> {{ timeLabel }}</div>
        <div v-if="!practice" class="text-body-2 text-medium-emphasis">Total {{ totalStrokes }} ({{ toPar }})</div>
        <v-btn v-else size="small" variant="tonal" prepend-icon="mdi-arrow-left" @click="backToCourse">Course</v-btn>
        <!-- Per-hole records: jump into any hole to chase its time. -->
        <v-menu location="bottom end">
          <template #activator="{ props: menuProps }">
            <v-btn v-bind="menuProps" size="small" variant="tonal" prepend-icon="mdi-flag-checkered">Holes</v-btn>
          </template>
          <v-list density="compact" min-width="250">
            <v-list-subheader>Best per hole — tap to practice</v-list-subheader>
            <v-list-item
              v-for="(b, i) in holeBests"
              :key="i"
              :active="i === holeIndex"
              @click="practiceHole(i)"
            >
              <v-list-item-title>
                Hole {{ i + 1 }}
                <span v-if="coursePars[i]" class="text-medium-emphasis">· Par {{ coursePars[i] }}</span>
              </v-list-item-title>
              <v-list-item-subtitle>
                <template v-if="b">⏱ {{ fmtMs(b.ms) }} · {{ b.strokes }} {{ b.strokes === 1 ? 'stroke' : 'strokes' }}</template>
                <template v-else>not sunk yet</template>
              </v-list-item-subtitle>
            </v-list-item>
          </v-list>
        </v-menu>
      </div>
    </div>

    <div ref="boardEl" class="stage" :style="{ width: boardW + 'px', height: boardH + 'px' }">
      <canvas
        ref="canvasEl"
        class="canvas"
        :style="{ width: boardW + 'px', height: boardH + 'px' }"
        @pointerdown.prevent="onPointerDown"
      />

      <transition name="fade">
        <div v-if="flashMsg" class="hazard-flash">{{ flashMsg }}</div>
      </transition>

      <!-- Practice sink: the new time next to the old one, then retry or return. -->
      <div v-if="phase === 'holed' && practice" class="overlay">
        <p class="text-h4 mb-1">⏱ {{ fmtMs(practiceResult?.ms ?? 0) }}</p>
        <p class="text-body-1 mb-1">
          Hole {{ holeIndex + 1 }} in {{ practiceResult?.strokes }}
          {{ practiceResult?.strokes === 1 ? 'stroke' : 'strokes' }} — par {{ par }}
        </p>
        <p v-if="practiceResult?.improved && practiceResult?.prev" class="text-body-1 text-amber mb-1">
          ⚡ Faster! Previous best {{ fmtMs(practiceResult.prev.ms) }} · {{ practiceResult.prev.strokes }}
        </p>
        <p v-else-if="practiceResult?.prev" class="text-body-2 text-medium-emphasis mb-1">
          Best stays {{ fmtMs(practiceResult.prev.ms) }} · {{ practiceResult.prev.strokes }}
        </p>
        <p v-else class="text-body-2 text-medium-emphasis mb-1">First time sinking this hole — record set.</p>
        <div class="d-flex ga-2 mt-3">
          <v-btn color="primary" variant="flat" prepend-icon="mdi-restart" @click="retryPractice">Retry hole</v-btn>
          <v-btn variant="tonal" prepend-icon="mdi-arrow-left" @click="backToCourse">Back to course</v-btn>
        </div>
      </div>

      <div v-else-if="phase === 'holed'" class="overlay">
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
        <p class="text-h5 mb-1"><v-icon icon="mdi-timer-outline" size="small" /> {{ timeLabel }}</p>
        <p v-if="isNewRecord" class="text-body-1 mb-1 text-amber">⚡ New course record!</p>
        <p v-else-if="bestLabel" class="text-body-2 text-medium-emphasis mb-1">Course record: {{ bestLabel }}</p>
        <p class="text-body-2 text-medium-emphasis mb-1">{{ totalStrokes }} strokes</p>
        <p class="text-h6 mb-4">{{ toPar === 'even' ? 'Even par' : `${toPar} to par` }}</p>
        <div class="d-flex ga-2">
          <v-btn color="primary" variant="flat" prepend-icon="mdi-timer-refresh-outline" @click="replayCourse">Replay course</v-btn>
          <v-btn variant="tonal" prepend-icon="mdi-refresh" @click="newCourse">New course</v-btn>
        </div>
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
.tabular {
  font-variant-numeric: tabular-nums;
}
.text-amber {
  color: #fbbf24;
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
