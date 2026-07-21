<script setup lang="ts">
/**
 * Count the Blocks — a memory game. Tetromino-like shapes stream across the
 * screen for a few seconds; then you answer how many there were (or, from level
 * 3, how many of one shape). Each correct answer advances a level (more shapes,
 * faster, shorter look); one wrong answer ends the run. Round data/difficulty
 * come from services/countBlocks.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import GameToolbar from '@/components/GameToolbar.vue'
import { useSquareFit } from '@/composables/useSquareFit'
import {
  SHAPE_CELLS,
  asksTarget,
  colorOf,
  correctAnswer,
  makeRound,
  type Round,
} from '@/services/countBlocks'

const { el: boardEl, px: boardPx } = useSquareFit(240)

const BEST_KEY = 'countblocks-best'

const canvasEl = ref<HTMLCanvasElement | null>(null)
const phase = ref<'watch' | 'answer' | 'result'>('watch')
const level = ref(1)
const answer = ref(0)
const lastCorrect = ref(0)
const wasRight = ref(false)
const best = ref(0)

let round: Round = makeRound(1, 'init')
let seed = 'seed'
let raf = 0
let startTs = 0

const targeted = computed(() => asksTarget(level.value))
const targetColor = computed(() => colorOf(round.target))
const question = computed(() =>
  targeted.value ? 'How many of this shape?' : 'How many blocks in total?',
)

const stopLoop = () => {
  cancelAnimationFrame(raf)
  raf = 0
}

const drawPieces = (t: number) => {
  const canvas = canvasEl.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  const W = boardPx.value
  const H = boardPx.value
  if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
    canvas.width = W * dpr
    canvas.height = H * dpr
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = '#0a0f1e'
  ctx.fillRect(0, 0, W, H)

  const laneH = H / round.lanes
  const cell = Math.min(laneH / 2.6, W / 18)
  const travelDur = round.exposureMs * 0.5
  const pieceMax = 4 * cell

  for (const p of round.pieces) {
    const startT = p.startOffset * round.exposureMs * 0.5
    const local = (t - startT) / travelDur
    if (local < 0 || local > 1) continue
    const x = local * (W + pieceMax * 2) - pieceMax
    const y = p.lane * laneH + laneH / 2 - cell
    ctx.fillStyle = p.color
    for (const [cx, cy] of SHAPE_CELLS[p.shape]) {
      ctx.fillRect(x + cx * cell, y + cy * cell, cell - 2, cell - 2)
    }
  }
}

const loop = (ts: number) => {
  if (phase.value !== 'watch') return
  const t = startTs ? ts - startTs : 0
  if (!startTs) startTs = ts
  drawPieces(t)
  if (t >= round.exposureMs) {
    stopLoop()
    // Clear the board so the answer isn't given away.
    const ctx = canvasEl.value?.getContext('2d')
    if (ctx) {
      ctx.fillStyle = '#0a0f1e'
      ctx.fillRect(0, 0, boardPx.value, boardPx.value)
    }
    phase.value = 'answer'
    answer.value = 0
    return
  }
  raf = requestAnimationFrame(loop)
}

const startWatch = () => {
  round = makeRound(level.value, seed)
  phase.value = 'watch'
  startTs = 0
  stopLoop()
  raf = requestAnimationFrame(loop)
}

const newGame = () => {
  level.value = 1
  seed = Math.floor(Math.random() * 0xffffffff).toString(36)
  startWatch()
}

const submit = () => {
  if (phase.value !== 'answer') return
  lastCorrect.value = correctAnswer(round)
  wasRight.value = answer.value === lastCorrect.value
  phase.value = 'result'
  if (wasRight.value) {
    if (level.value > best.value) {
      best.value = level.value
      try {
        localStorage.setItem(BEST_KEY, String(best.value))
      } catch {
        // ignore
      }
    }
  }
}

const next = () => {
  level.value += 1
  startWatch()
}

const adjust = (delta: number) => {
  answer.value = Math.max(0, Math.min(40, answer.value + delta))
}

watch(boardPx, () => {
  // Redraw at the current elapsed time; before the first frame startTs is 0.
  if (phase.value === 'watch') drawPieces(startTs ? performance.now() - startTs : 0)
  else drawPieces(round.exposureMs) // answer/result: keep the board cleared
})

onMounted(() => {
  try {
    best.value = Number(localStorage.getItem(BEST_KEY)) || 0
  } catch {
    best.value = 0
  }
  newGame()
})
onBeforeUnmount(stopLoop)
</script>

<template>
  <v-container class="py-6" max-width="560">
    <GameToolbar title="Count the Blocks">
      <template #intro>
        Watch the shapes slide past, then answer how many there were. From level 3 you'll be asked
        how many of <em>one</em> shape. Get it right to level up — it gets faster and busier.
      </template>
      <template #info>
        <h3>Goal</h3>
        <p>Keep a running count of the blocks streaming across the screen, then enter it. Each correct answer advances a level; one miss ends the run.</p>
        <h3>How it works</h3>
        <ul>
          <li>Early levels: count <em>all</em> the shapes.</li>
          <li>Level 3+: count only the shapes matching the one shown in the question.</li>
          <li>Higher levels add more shapes, move faster, and give you less time.</li>
        </ul>
        <h3>Tips</h3>
        <ul>
          <li>Scan lane by lane rather than chasing individual shapes.</li>
          <li>For the targeted question, lock onto the color and ignore the rest.</li>
        </ul>
      </template>
    </GameToolbar>

    <div class="d-flex align-center mb-3">
      <div class="text-h6">Level <span class="font-weight-bold">{{ level }}</span></div>
      <v-spacer />
      <div class="text-body-2 text-medium-emphasis">Best level: {{ best }}</div>
    </div>

    <div ref="boardEl" class="stage" :style="{ width: boardPx + 'px', height: boardPx + 'px' }">
      <canvas ref="canvasEl" class="canvas" :style="{ width: boardPx + 'px', height: boardPx + 'px' }" />

      <div v-if="phase === 'watch'" class="banner">Watch closely…</div>

      <div v-else class="overlay">
        <template v-if="phase === 'answer'">
          <p class="text-h6 mb-1 d-flex align-center ga-2">
            {{ question }}
            <svg v-if="targeted" width="34" height="24" viewBox="0 0 4 2" class="shape-icon">
              <rect
                v-for="([cx, cy], i) in SHAPE_CELLS[round.target]"
                :key="i"
                :x="cx"
                :y="cy"
                width="0.92"
                height="0.92"
                :fill="targetColor"
              />
            </svg>
          </p>
          <div class="stepper my-3">
            <v-btn icon="mdi-minus" size="large" variant="tonal" @click="adjust(-1)" />
            <span class="answer-num">{{ answer }}</span>
            <v-btn icon="mdi-plus" size="large" variant="tonal" @click="adjust(1)" />
          </div>
          <v-btn color="primary" variant="flat" size="large" @click="submit">Submit</v-btn>
        </template>

        <template v-else>
          <p class="text-h4 mb-1">{{ wasRight ? 'Correct! 🎉' : 'Wrong' }}</p>
          <p class="text-body-1 mb-4">
            It was <strong>{{ lastCorrect }}</strong><span v-if="!wasRight"> — you said {{ answer }}</span>.
          </p>
          <v-btn v-if="wasRight" color="primary" variant="flat" prepend-icon="mdi-arrow-right" @click="next">
            Level {{ level + 1 }}
          </v-btn>
          <v-btn v-else color="primary" variant="flat" prepend-icon="mdi-restart" @click="newGame">
            Play again (reached level {{ level }})
          </v-btn>
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
  box-shadow: 0 0 40px rgba(168, 85, 247, 0.15);
}
.canvas {
  display: block;
}
.banner {
  position: absolute;
  top: 10px;
  left: 0;
  right: 0;
  text-align: center;
  font-weight: 600;
  color: rgba(226, 232, 240, 0.8);
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.6);
  pointer-events: none;
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
  background: rgba(2, 6, 23, 0.82);
  backdrop-filter: blur(3px);
}
.stepper {
  display: flex;
  align-items: center;
  gap: 20px;
}
.answer-num {
  font-size: 3rem;
  font-weight: 800;
  min-width: 70px;
  font-variant-numeric: tabular-nums;
}
.shape-icon {
  overflow: visible;
}
</style>
