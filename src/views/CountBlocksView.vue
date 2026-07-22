<script setup lang="ts">
/**
 * Count the Blocks — a memory game. A single cohesive pattern of blocks is
 * shown; then you answer how many blocks it contained. What you count is
 * exactly the correct answer (no hidden target-shape twist). Two modes:
 *   - Normal: the pattern flashes statically on the grid.
 *   - Hard: the same cohesive group slides across the screen — count the blocks
 *     as they stream past.
 * Each correct answer advances a level (more blocks, bigger grid, shorter
 * reveal); one wrong answer ends the run. Round data comes from
 * services/countBlocks.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import GameToolbar from '@/components/GameToolbar.vue'
import { useSquareFit } from '@/composables/useSquareFit'
import { correctAnswer, makeRound, type CountMode, type Round } from '@/services/countBlocks'

const { el: boardEl, px: boardPx } = useSquareFit(36)

const BEST_KEY = 'countblocks-best'
const MODE_KEY = 'countblocks-mode'

const canvasEl = ref<HTMLCanvasElement | null>(null)
const phase = ref<'watch' | 'answer' | 'result'>('watch')
const mode = ref<CountMode>('normal')
const level = ref(1)
const answer = ref(0)
const lastCorrect = ref(0)
const wasRight = ref(false)
const best = ref(0)
const remaining = ref(0) // ms left in the reveal, for the countdown bar

let round: Round = makeRound(1, 'init')
let seed = 'seed'
let raf = 0
let startTs = 0

const progress = computed(() =>
  round.exposureMs ? Math.max(0, Math.min(100, (remaining.value / round.exposureMs) * 100)) : 0,
)

const stopLoop = () => {
  cancelAnimationFrame(raf)
  raf = 0
}

const clearBoard = () => {
  const ctx = canvasEl.value?.getContext('2d')
  if (!ctx) return
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = '#0a0f1e'
  ctx.fillRect(0, 0, canvasEl.value!.width, canvasEl.value!.height)
}

/**
 * Draw the pattern at elapsed time `t` (ms). In normal mode the group is
 * centered and static; in hard mode the whole group is translated horizontally
 * so it slides from off the right edge to off the left edge across the reveal.
 */
const drawScene = (t: number) => {
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
  ctx.fillStyle = '#0a0f1e'
  ctx.fillRect(0, 0, S, S)

  // Blocks are the same size in both modes (so a level looks identical); only
  // the group's horizontal position differs.
  const cell = Math.floor(S / Math.max(round.cols, round.rows))
  const gap = Math.max(2, Math.round(cell * 0.08))
  const gridW = cell * round.cols
  const gridH = cell * round.rows
  const r = Math.max(2, Math.round(cell * 0.14))

  const oy = Math.floor((S - gridH) / 2)
  let ox: number
  if (round.mode === 'hard') {
    // Slide the whole group from fully off the right to fully off the left.
    const p = round.exposureMs ? Math.max(0, Math.min(1, t / round.exposureMs)) : 1
    ox = Math.round(S - p * (S + gridW))
  } else {
    ox = Math.floor((S - gridW) / 2)
  }

  for (const c of round.cells) {
    const x = ox + c.x * cell + gap / 2
    const y = oy + c.y * cell + gap / 2
    const w = cell - gap
    ctx.fillStyle = c.color
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath()
      ctx.roundRect(x, y, w, w, r)
      ctx.fill()
    } else {
      ctx.fillRect(x, y, w, w)
    }
  }
}

const loop = (ts: number) => {
  if (phase.value !== 'watch') return
  if (!startTs) startTs = ts
  const t = ts - startTs
  remaining.value = round.exposureMs - t
  drawScene(t)
  if (t >= round.exposureMs) {
    stopLoop()
    clearBoard() // hide the pattern so the answer isn't given away
    phase.value = 'answer'
    answer.value = 0
    return
  }
  raf = requestAnimationFrame(loop)
}

const startWatch = () => {
  round = makeRound(level.value, seed, mode.value)
  phase.value = 'watch'
  remaining.value = round.exposureMs
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
  if (wasRight.value && level.value > best.value) {
    best.value = level.value
    try {
      localStorage.setItem(BEST_KEY, String(best.value))
    } catch {
      // ignore
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
  if (phase.value === 'watch') drawScene(startTs ? performance.now() - startTs : 0)
  else clearBoard()
})

// Switching difficulty restarts the run so the new mode applies cleanly.
watch(mode, () => {
  try {
    localStorage.setItem(MODE_KEY, mode.value)
  } catch {
    // ignore
  }
  newGame()
})

onMounted(() => {
  try {
    best.value = Number(localStorage.getItem(BEST_KEY)) || 0
    if (localStorage.getItem(MODE_KEY) === 'hard') mode.value = 'hard'
  } catch {
    best.value = 0
  }
  newGame()
})
onBeforeUnmount(stopLoop)
</script>

<template>
  <v-container class="py-4" max-width="820">
    <GameToolbar title="Count the Blocks">
      <template #intro>
        A cohesive pattern of blocks appears briefly. Count them, then enter how many there were.
        Get it right to level up — more blocks, a bigger grid, and a shorter reveal. In Hard mode the
        blocks slide across the screen instead of flashing.
      </template>
      <template #settings>
        <div class="text-subtitle-2 mb-2">Difficulty</div>
        <v-btn-toggle v-model="mode" mandatory density="comfortable" color="primary" divided class="d-flex">
          <v-btn value="normal" class="flex-grow-1">Normal</v-btn>
          <v-btn value="hard" class="flex-grow-1">Hard</v-btn>
        </v-btn-toggle>
        <p class="text-caption text-medium-emphasis mt-2 mb-0">
          Normal flashes the pattern in place. Hard slides the blocks across the screen — count them
          as they stream past. Changing this starts a new run.
        </p>
      </template>
      <template #info>
        <h3>Goal</h3>
        <p>One cohesive pattern of colored blocks is shown for a few seconds. When it disappears, enter the total number of blocks you saw. Each correct answer advances a level; one miss ends the run.</p>
        <h3>Modes</h3>
        <ul>
          <li><strong>Normal</strong> — the pattern flashes statically on the grid.</li>
          <li><strong>Hard</strong> — the same cohesive group slides across the screen; count the blocks as they stream past.</li>
        </ul>
        <h3>How it works</h3>
        <ul>
          <li>Every block counts — the answer is simply the total number of blocks in the pattern.</li>
          <li>Higher levels add more blocks, enlarge the grid, and shorten the reveal.</li>
        </ul>
        <h3>Tips</h3>
        <ul>
          <li>Count in small groups (rows, columns, or clusters of 2–3) rather than one at a time.</li>
          <li>The blocks always form one connected shape — trace its outline to estimate fast.</li>
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

      <div v-if="phase === 'watch'" class="timer">
        <div class="timer-fill" :style="{ width: progress + '%' }" />
      </div>

      <div v-else class="overlay">
        <template v-if="phase === 'answer'">
          <p class="text-h6 mb-1">How many blocks did you count?</p>
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
.timer {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 12px;
  height: 6px;
  border-radius: 3px;
  background: rgba(148, 163, 184, 0.2);
  overflow: hidden;
  pointer-events: none;
}
.timer-fill {
  height: 100%;
  background: linear-gradient(90deg, #a855f7, #22d3ee);
  border-radius: 3px;
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
</style>
