<script setup lang="ts">
/**
 * Sudoku — a seeded, always-unique puzzle with pencil notes, conflict
 * highlighting, hints, and four difficulties. The puzzle is regenerated from the
 * URL seed, so a board is shareable. Generation/solving live in services/sudoku.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import GameToolbar from '@/components/GameToolbar.vue'
import { copyToClipboard } from '@/services/share'
import { randomSeed } from '@/services/seed'
import { useSquareFit } from '@/composables/useSquareFit'
import {
  CELLS,
  N,
  findConflicts,
  generatePuzzle,
  isComplete,
  type Difficulty,
  type Grid,
} from '@/services/sudoku'
import { findHint, type Hint } from '@/services/sudokuHints'

const { el: boardEl, px: boardPx } = useSquareFit(220)

const route = useRoute()
const router = useRouter()

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'expert']

const difficulty = ref<Difficulty>('easy')
const code = ref('')
const cells = ref<Grid>([])
const given = ref<boolean[]>([])
const solution = ref<Grid>([])
const notes = ref<Set<number>[]>([])
const selected = ref<number | null>(null)
const notesMode = ref(false)
const seconds = ref(0)
const snackbar = ref(false)

// Number lock: long-press a pad digit to keep it active so every cell tap
// places it. `lockedDigit` is the pinned value (null = off).
const lockedDigit = ref<number | null>(null)

// Progressive hints: `activeHint` is the current technique found by the
// strategy solver; `hintLevel` indexes into its `levels` nudges.
const activeHint = ref<Hint | null>(null)
const hintLevel = ref(0)
const hintMessage = ref('')

let timer: ReturnType<typeof setInterval> | null = null

const conflicts = computed(() => findConflicts(cells.value))
const solved = computed(() => cells.value.length > 0 && isComplete(cells.value))

// How many of each digit are placed (to dim a digit once all nine are down).
const digitCounts = computed(() => {
  const counts = new Array(N + 1).fill(0)
  for (const v of cells.value) counts[v] += 1
  return counts
})

const rowOf = (i: number) => Math.floor(i / N)
const colOf = (i: number) => i % N
const boxOf = (i: number) => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3)

// Cells sharing a row, column, or box with the selection (for highlighting).
const peers = computed(() => {
  const set = new Set<number>()
  const s = selected.value
  if (s === null) return set
  for (let i = 0; i < CELLS; i += 1) {
    if (rowOf(i) === rowOf(s) || colOf(i) === colOf(s) || boxOf(i) === boxOf(s)) set.add(i)
  }
  return set
})

const selectedValue = computed(() => (selected.value === null ? 0 : cells.value[selected.value]))

// From the "exact cell" step on, highlight the cells the hint is about.
const hintCells = computed(() => {
  const set = new Set<number>()
  if (activeHint.value && hintLevel.value >= 2) {
    for (const c of activeHint.value.cells) set.add(c)
  }
  return set
})
const hintElimCells = computed(() => {
  const set = new Set<number>()
  if (activeHint.value && hintLevel.value >= 2) {
    for (const e of activeHint.value.eliminations) set.add(e.cell)
  }
  return set
})

const clearHint = () => {
  activeHint.value = null
  hintLevel.value = 0
  hintMessage.value = ''
}

const stopTimer = () => {
  if (timer) clearInterval(timer)
  timer = null
}
const startTimer = () => {
  stopTimer()
  timer = setInterval(() => {
    seconds.value += 1
  }, 1000)
}
const timeLabel = computed(() => {
  const m = Math.floor(seconds.value / 60)
  const s = seconds.value % 60
  return `${m}:${String(s).padStart(2, '0')}`
})

const build = () => {
  const puzzle = generatePuzzle(difficulty.value, code.value)
  cells.value = puzzle.puzzle.slice()
  given.value = puzzle.given.slice()
  solution.value = puzzle.solution.slice()
  notes.value = Array.from({ length: CELLS }, () => new Set<number>())
  selected.value = null
  lockedDigit.value = null
  clearHint()
  seconds.value = 0
  startTimer()
}

const syncUrl = () => router.replace({ name: 'sudoku', params: { seed: `${difficulty.value}.${code.value}` } })

const newGame = () => {
  code.value = randomSeed()
  syncUrl()
  build()
}

const setDifficulty = (d: Difficulty) => {
  difficulty.value = d
  newGame()
}

const select = (i: number) => {
  selected.value = i
  // With a locked digit, tapping a cell places that digit straight away.
  if (lockedDigit.value !== null) placeLocked(i)
}

const clearPeerNotes = (i: number, v: number) => {
  for (let j = 0; j < CELLS; j += 1) {
    if (j === i) continue
    if (rowOf(j) === rowOf(i) || colOf(j) === colOf(i) || boxOf(j) === boxOf(i)) {
      notes.value[j].delete(v)
    }
  }
}

const inputDigit = (v: number) => {
  const i = selected.value
  if (i === null || given.value[i] || solved.value) return
  clearHint()
  if (notesMode.value) {
    if (cells.value[i]) return // can't note a filled cell
    const set = notes.value[i]
    if (set.has(v)) set.delete(v)
    else set.add(v)
    notes.value = [...notes.value] // trigger reactivity on the Set mutation
  } else {
    const next = cells.value.slice()
    next[i] = next[i] === v ? 0 : v // tapping the same digit clears it
    cells.value = next
    notes.value[i].clear()
    if (next[i]) clearPeerNotes(i, v)
    notes.value = [...notes.value]
    if (solved.value) stopTimer()
  }
}

// Place the currently locked digit into cell `i` (used by cell taps in lock
// mode). Unlike inputDigit it never toggles off, and auto-advances the lock.
const placeLocked = (i: number) => {
  const v = lockedDigit.value
  if (v === null || given.value[i] || solved.value) return
  clearHint()
  const next = cells.value.slice()
  next[i] = v
  cells.value = next
  notes.value[i].clear()
  clearPeerNotes(i, v)
  notes.value = [...notes.value]
  advanceLock()
  if (solved.value) stopTimer()
}

// Once every copy of the locked digit is placed, jump the lock to the next
// digit that still has cells to fill; turn it off when the board is full.
const advanceLock = () => {
  const v = lockedDigit.value
  if (v === null || digitCounts.value[v] < 9) return
  for (let step = 1; step <= N; step += 1) {
    const d = ((v - 1 + step) % N) + 1
    if (digitCounts.value[d] < 9) {
      lockedDigit.value = d
      return
    }
  }
  lockedDigit.value = null
}

// Number-pad tap (not a long-press): manage the lock, else place normally.
const tapPad = (n: number) => {
  if (lockedDigit.value !== null) {
    // Tapping the locked digit turns the lock off; a different one switches it.
    lockedDigit.value = lockedDigit.value === n ? null : n
    return
  }
  inputDigit(n)
}

// Long-press wiring for locking a pad digit.
let pressTimer: ReturnType<typeof setTimeout> | null = null
let longPressed = false
const startPress = (n: number) => {
  longPressed = false
  pressTimer = setTimeout(() => {
    longPressed = true
    lockedDigit.value = n
  }, 450)
}
const endPress = () => {
  if (pressTimer) clearTimeout(pressTimer)
  pressTimer = null
}
const clickPad = (n: number) => {
  if (longPressed) {
    longPressed = false // long-press already handled the lock; swallow the click
    return
  }
  tapPad(n)
}

const erase = () => {
  const i = selected.value
  if (i === null || given.value[i] || solved.value) return
  clearHint()
  const next = cells.value.slice()
  next[i] = 0
  cells.value = next
  notes.value[i].clear()
  notes.value = [...notes.value]
}

// Fallback when no supported human technique applies: reveal a single cell
// from the stored solution (the old hint behaviour).
const revealCell = () => {
  const i = cells.value.findIndex((v, idx) => !given.value[idx] && v !== solution.value[idx])
  if (i === -1) return
  selected.value = i
  const next = cells.value.slice()
  next[i] = solution.value[i]
  cells.value = next
  notes.value[i].clear()
  clearPeerNotes(i, next[i])
  notes.value = [...notes.value]
  hintMessage.value = `No forced move found — revealed row ${rowOf(i) + 1}, column ${colOf(i) + 1} for you.`
  if (solved.value) stopTimer()
}

const applyHint = (h: Hint) => {
  if (h.placement) {
    const { cell, value } = h.placement
    if (given.value[cell] || solved.value) return
    const next = cells.value.slice()
    next[cell] = value
    cells.value = next
    notes.value[cell].clear()
    clearPeerNotes(cell, value)
    notes.value = [...notes.value]
    if (solved.value) stopTimer()
  } else {
    // Elimination techniques: strike the ruled-out candidates from any notes.
    for (const e of h.eliminations) notes.value[e.cell].delete(e.value)
    notes.value = [...notes.value]
  }
}

// Progressive hint: first press finds the easiest technique and states it;
// each subsequent press narrows in, then highlights the cell, then reveals /
// applies the move on the final step.
const hint = () => {
  if (solved.value) return
  const current = activeHint.value
  if (!current) {
    const h = findHint(cells.value)
    if (!h) {
      revealCell()
      return
    }
    activeHint.value = h
    hintLevel.value = 0
    hintMessage.value = h.levels[0]
    return
  }
  if (hintLevel.value < current.levels.length - 1) {
    hintLevel.value += 1
    hintMessage.value = current.levels[hintLevel.value]
    if (hintLevel.value >= 2 && current.cells.length) selected.value = current.cells[0]
    if (hintLevel.value === current.levels.length - 1) applyHint(current)
    return
  }
  // Final step already applied — clear and look for the next move.
  clearHint()
  hint()
}

const move = (dr: number, dc: number) => {
  const s = selected.value ?? 0
  const r = Math.min(N - 1, Math.max(0, rowOf(s) + dr))
  const c = Math.min(N - 1, Math.max(0, colOf(s) + dc))
  selected.value = r * N + c
}

const onKey = (e: KeyboardEvent) => {
  if (e.key >= '1' && e.key <= '9') {
    e.preventDefault()
    inputDigit(Number(e.key))
  } else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
    e.preventDefault()
    erase()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    move(-1, 0)
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    move(1, 0)
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    move(0, -1)
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    move(0, 1)
  } else if (e.key === 'n' || e.key === 'N') {
    notesMode.value = !notesMode.value
  }
}

const cellClass = (i: number) => ({
  'cell--given': given.value[i],
  'cell--selected': selected.value === i,
  'cell--peer': selected.value !== null && selected.value !== i && peers.value.has(i),
  'cell--same': selectedValue.value > 0 && cells.value[i] === selectedValue.value,
  'cell--conflict': conflicts.value.has(i),
  'cell--hint': hintCells.value.has(i),
  'cell--hint-elim': hintElimCells.value.has(i),
  'cell--r3': colOf(i) % 3 === 0,
  'cell--b3': rowOf(i) % 3 === 0,
})

const share = async () => {
  const url = window.location.origin + route.fullPath
  await copyToClipboard(`Try this ${difficulty.value} Sudoku:\n${url}`)
  snackbar.value = true
}

onMounted(() => {
  const p = typeof route.params.seed === 'string' ? route.params.seed : ''
  const m = /^(easy|medium|hard|expert)\.(.+)$/.exec(p)
  if (m) {
    difficulty.value = m[1] as Difficulty
    code.value = m[2]
    build()
  } else {
    newGame()
  }
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  stopTimer()
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <v-container class="py-6" max-width="620">
    <GameToolbar title="Sudoku" shareable @share="share">
      <template #intro>
        Fill the grid so every row, column, and 3×3 box holds 1–9. Tap a cell, then a number — or
        use the keyboard. It's a fresh, always-solvable puzzle every time.
      </template>
      <template #settings>
        <div class="d-flex flex-column ga-4">
          <div>
            <label class="text-caption text-medium-emphasis d-block mb-1">Difficulty</label>
            <v-btn-toggle
              :model-value="difficulty"
              mandatory
              density="compact"
              variant="outlined"
              divided
              @update:model-value="setDifficulty"
            >
              <v-btn v-for="d in DIFFICULTIES" :key="d" :value="d" size="small" class="text-capitalize">{{ d }}</v-btn>
            </v-btn-toggle>
          </div>
          <v-btn variant="tonal" color="primary" prepend-icon="mdi-refresh" @click="newGame">New puzzle</v-btn>
        </div>
      </template>
      <template #info>
        <h3>Goal</h3>
        <p>Place the digits 1–9 so that each row, each column, and each 3×3 box contains every digit exactly once.</p>
        <h3>Controls</h3>
        <ul>
          <li>Click/tap a cell, then a number (or press <span class="k">1</span>–<span class="k">9</span>).</li>
          <li><span class="k">Notes</span> mode (or <span class="k">N</span>) pencils in small candidates.</li>
          <li><span class="k">Backspace</span> / the erase button clears a cell; arrow keys move.</li>
          <li><strong>Long-press a number</strong> to lock it: every cell you tap then gets that digit, and the lock jumps to the next digit once all nine are placed. Tap it again to unlock.</li>
          <li><span class="k">Hint</span> finds the next logical move by name (naked/hidden single, locked candidate, pairs) and nudges you step by step — press again to narrow in, and only the last step reveals the value.</li>
        </ul>
        <h3>Difficulty</h3>
        <p>Higher difficulties start with fewer given numbers. Every puzzle is guaranteed to have exactly one solution.</p>
      </template>
    </GameToolbar>

    <!-- Status bar -->
    <div class="d-flex align-center ga-3 mb-3">
      <v-chip variant="tonal" class="text-capitalize">{{ difficulty }}</v-chip>
      <div class="text-body-1"><v-icon icon="mdi-clock-outline" size="small" /> {{ timeLabel }}</div>
      <v-spacer />
      <v-btn variant="tonal" color="primary" prepend-icon="mdi-refresh" @click="newGame">New</v-btn>
    </div>

    <!-- Board -->
    <div ref="boardEl" class="board-wrap" :style="{ width: boardPx + 'px', height: boardPx + 'px' }">
      <div class="board">
        <button
          v-for="(v, i) in cells"
          :key="i"
          type="button"
          class="cell"
          :class="cellClass(i)"
          @click="select(i)"
        >
          <span v-if="v" class="cell-value">{{ v }}</span>
          <span v-else-if="notes[i] && notes[i].size" class="notes">
            <span v-for="n in 9" :key="n" class="note">{{ notes[i].has(n) ? n : '' }}</span>
          </span>
        </button>
      </div>
      <div v-if="solved" class="overlay">
        <p class="text-h4 mb-1">Solved! 🎉</p>
        <p class="text-body-1 mb-4">{{ difficulty }} · {{ timeLabel }}</p>
        <v-btn color="primary" variant="flat" prepend-icon="mdi-refresh" @click="newGame">New puzzle</v-btn>
      </div>
    </div>

    <!-- Number pad (long-press a digit to lock it) -->
    <div class="pad mt-4">
      <v-btn
        v-for="n in 9"
        :key="n"
        class="pad-btn"
        :class="{ 'pad-btn--locked': lockedDigit === n }"
        :variant="lockedDigit === n ? 'flat' : 'tonal'"
        :color="lockedDigit === n ? 'primary' : undefined"
        :disabled="digitCounts[n] >= 9"
        @pointerdown="startPress(n)"
        @pointerup="endPress"
        @pointerleave="endPress"
        @pointercancel="endPress"
        @contextmenu.prevent
        @click="clickPad(n)"
      >{{ n }}</v-btn>
    </div>

    <!-- Lock status -->
    <div class="text-center text-caption text-medium-emphasis mt-2" style="min-height: 1.2em">
      <template v-if="lockedDigit !== null">
        <v-icon icon="mdi-lock" size="x-small" /> {{ lockedDigit }} locked — tap cells to place it. Tap {{ lockedDigit }} again to unlock.
      </template>
      <template v-else>Long-press a number to lock it for repeated placement.</template>
    </div>

    <!-- Progressive hint banner -->
    <v-alert
      v-if="hintMessage"
      class="mt-3"
      type="info"
      variant="tonal"
      density="comfortable"
      closable
      @click:close="clearHint"
    >
      {{ hintMessage }}
      <template v-if="activeHint" #append>
        <span class="text-caption">{{ hintLevel + 1 }}/{{ activeHint.levels.length }}</span>
      </template>
    </v-alert>

    <!-- Tools -->
    <div class="d-flex justify-center ga-2 mt-3 flex-wrap">
      <v-btn :variant="notesMode ? 'flat' : 'tonal'" :color="notesMode ? 'primary' : undefined" prepend-icon="mdi-pencil-outline" @click="notesMode = !notesMode">
        Notes {{ notesMode ? 'on' : 'off' }}
      </v-btn>
      <v-btn variant="tonal" prepend-icon="mdi-eraser" @click="erase">Erase</v-btn>
      <v-btn variant="tonal" prepend-icon="mdi-lightbulb-on-outline" @click="hint">
        {{ activeHint ? 'Next hint' : 'Hint' }}
      </v-btn>
    </div>

    <v-snackbar v-model="snackbar" :timeout="2600" color="secondary">Puzzle link copied — share it!</v-snackbar>
  </v-container>
</template>

<style scoped>
.board-wrap {
  position: relative;
}
.board {
  display: grid;
  grid-template-columns: repeat(9, 1fr);
  grid-template-rows: repeat(9, 1fr);
  width: 100%;
  height: 100%;
  border: 2px solid rgba(148, 163, 184, 0.7);
  border-radius: 8px;
  overflow: hidden;
  background: rgba(2, 6, 23, 0.85);
  user-select: none;
}

.cell {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(148, 163, 184, 0.18);
  font-size: clamp(1rem, 5vw, 1.6rem);
  color: #93c5fd; /* player entries: light blue */
  background: transparent;
  cursor: pointer;
  transition: background 90ms ease;
}
/* Thicker lines between 3×3 boxes */
.cell--r3 { border-left: 2px solid rgba(148, 163, 184, 0.6); }
.cell--b3 { border-top: 2px solid rgba(148, 163, 184, 0.6); }

.cell--given {
  color: #e2e8f0;
  font-weight: 700;
  cursor: default;
}
.cell--peer { background: rgba(148, 163, 184, 0.08); }
.cell--same { background: rgba(59, 130, 246, 0.22); }
.cell--selected { background: rgba(59, 130, 246, 0.38); }
.cell--conflict { color: #f87171; background: rgba(248, 113, 113, 0.18); }
/* Hint highlighting: target cell(s) glow, elimination cells get a softer tint */
.cell--hint-elim { background: rgba(250, 204, 21, 0.14); }
.cell--hint {
  background: rgba(250, 204, 21, 0.3);
  box-shadow: inset 0 0 0 2px rgba(250, 204, 21, 0.85);
}

.notes {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  width: 100%;
  height: 100%;
  padding: 2px;
}
.note {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.55rem;
  line-height: 1;
  color: rgba(148, 163, 184, 0.85);
}

.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  text-transform: capitalize;
  background: rgba(2, 6, 23, 0.8);
  backdrop-filter: blur(3px);
  border-radius: 8px;
}

.pad {
  display: grid;
  grid-template-columns: repeat(9, 1fr);
  gap: 6px;
}
.pad-btn {
  min-width: 0;
  font-size: 1.15rem;
  font-weight: 700;
  touch-action: manipulation; /* avoid text-selection / callout on long-press */
}
.pad-btn--locked {
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.6);
}
</style>
