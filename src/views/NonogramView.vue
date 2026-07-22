<script setup lang="ts">
/**
 * Nonogram (Picross) — reveal a hidden picture by filling cells that satisfy the
 * row/column run-length clues. Drag to paint, right-click / X-mode to mark
 * "empty". Seeded and shareable; a puzzle is solved when every clue is met.
 * Clue derivation and checking live in services/nonogram.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import GameToolbar from '@/components/GameToolbar.vue'
import { copyToClipboard } from '@/services/share'
import { randomSeed } from '@/services/seed'
import { useSquareFit } from '@/composables/useSquareFit'
import {
  generateNonogram,
  isSolved,
  lineConsistent,
  nonogramFromPattern,
  satisfiedClues,
  type Cell,
  type Nonogram,
} from '@/services/nonogram'
import { patternById, patternsForSize } from '@/services/nonogramPatterns'

const { el: boardEl, px: boardPx } = useSquareFit(96)

const route = useRoute()
const router = useRouter()

const SIZES = [5, 10, 15]

// Fill-color themes for the painted cells (picked in settings).
const THEMES = [
  { id: 'violet', label: 'Violet', fill: '#7c3aed' },
  { id: 'ocean', label: 'Ocean', fill: '#0ea5e9' },
  { id: 'sunset', label: 'Sunset', fill: '#f97316' },
  { id: 'forest', label: 'Forest', fill: '#22c55e' },
] as const

const size = ref(10)
const code = ref('')
const pattern = ref('random') // 'random' or a pattern id
const theme = ref<string>('violet')
const puzzle = ref<Nonogram>(generateNonogram(10, 10, 'init'))
const marks = ref<number[]>([]) // 0 empty · 1 filled · 2 X-marked
const mode = ref<'fill' | 'mark'>('fill')
const snackbar = ref(false)

// Pictures the player can pick for the current board size.
const patternOptions = computed(() => [
  { title: 'Random', value: 'random' },
  ...patternsForSize(size.value).map((p) => ({ title: p.name, value: p.id })),
])
const themeFill = computed(() => THEMES.find((t) => t.id === theme.value)?.fill ?? THEMES[0].fill)

const rows = computed(() => puzzle.value.rows)
const cols = computed(() => puzzle.value.cols)

const idx = (r: number, c: number) => r * cols.value + c

const maxRowClueLen = computed(() => Math.max(1, ...puzzle.value.rowClues.map((c) => c.length)))
const maxColClueLen = computed(() => Math.max(1, ...puzzle.value.colClues.map((c) => c.length)))

// Fit clues + board into the measured square. Clamp cells so the board scales
// UP to fill desktop space (bigger cells) without a single small picture
// ballooning into absurdly large squares.
const cell = computed(() => {
  const across = cols.value + maxRowClueLen.value
  const down = rows.value + maxColClueLen.value
  const fit = Math.floor(boardPx.value / Math.max(across, down))
  return Math.min(64, Math.max(16, fit))
})
const gridStyle = computed(() => ({
  gridTemplateColumns: `${maxRowClueLen.value * cell.value}px repeat(${cols.value}, ${cell.value}px)`,
  gridTemplateRows: `${maxColClueLen.value * cell.value}px repeat(${rows.value}, ${cell.value}px)`,
  fontSize: `${Math.max(9, Math.floor(cell.value * 0.42))}px`,
  '--nono-fill': themeFill.value,
}))

const asBool = computed(() => marks.value.map((m) => m === 1))
const solved = computed(() => marks.value.length > 0 && isSolved(asBool.value, puzzle.value))

// Extract a row / column of the player's marks as service `Cell`s.
const rowCells = (r: number): Cell[] =>
  marks.value.slice(r * cols.value, (r + 1) * cols.value) as Cell[]
const colCells = (c: number): Cell[] => {
  const line: Cell[] = []
  for (let r = 0; r < rows.value; r += 1) line.push(marks.value[idx(r, c)] as Cell)
  return line
}

// Per-number greying: which individual clue entries are unambiguously placed.
const rowSatisfied = computed(() =>
  puzzle.value.rowClues.map((clue, r) => satisfiedClues(rowCells(r), clue)),
)
const colSatisfied = computed(() =>
  puzzle.value.colClues.map((clue, c) => satisfiedClues(colCells(c), clue)),
)

// Validation: lines flagged RED because their fills can no longer match the
// clues. Set by the Check button, cleared per-line as soon as a square changes.
const rowBad = ref<boolean[]>([])
const colBad = ref<boolean[]>([])
const validate = () => {
  rowBad.value = puzzle.value.rowClues.map((clue, r) => !lineConsistent(rowCells(r), clue))
  colBad.value = puzzle.value.colClues.map((clue, c) => !lineConsistent(colCells(c), clue))
}
const clearValidation = () => {
  rowBad.value = []
  colBad.value = []
}
// A square at index i sits on one row and one column — clear only their flags.
const clearLineValidation = (i: number) => {
  const r = Math.floor(i / cols.value)
  const c = i % cols.value
  if (rowBad.value.length) rowBad.value[r] = false
  if (colBad.value.length) colBad.value[c] = false
}

const build = () => {
  if (pattern.value !== 'random') {
    const p = patternById(pattern.value, size.value)
    if (p) {
      puzzle.value = nonogramFromPattern(p)
      marks.value = new Array(size.value * size.value).fill(0)
      clearValidation()
      return
    }
    pattern.value = 'random' // no such picture at this size — fall back
  }
  puzzle.value = generateNonogram(size.value, size.value, code.value)
  marks.value = new Array(size.value * size.value).fill(0)
  clearValidation()
}

// A named picture shares as `@id`; a random puzzle shares its seed code.
const seedCode = computed(() => (pattern.value === 'random' ? code.value : `@${pattern.value}`))
const syncUrl = () =>
  router.replace({ name: 'nonogram', params: { seed: `${size.value}.${seedCode.value}` } })
const newGame = () => {
  if (pattern.value === 'random') code.value = randomSeed()
  syncUrl()
  build()
}
const setSize = (v: number) => {
  size.value = v
  // Drop a picture selection that doesn't exist at the new size.
  if (pattern.value !== 'random' && !patternById(pattern.value, v)) pattern.value = 'random'
  newGame()
}
const setPattern = (v: string | null) => {
  pattern.value = v ?? 'random'
  if (pattern.value === 'random' && !code.value) code.value = randomSeed()
  syncUrl()
  build()
}

// --- Painting -----------------------------------------------------------
let painting = false
let paintTo = 0

const applyPaint = (i: number) => {
  if (solved.value) return
  const cur = marks.value[i]
  if (mode.value === 'fill') {
    if (paintTo === 1) marks.value[i] = 1
    else if (cur === 1) marks.value[i] = 0 // erase only filled cells while dragging
  } else if (paintTo === 2) {
    if (cur !== 1) marks.value[i] = 2 // don't X over a filled cell
  } else if (cur === 2) {
    marks.value[i] = 0
  }
  if (marks.value[i] !== cur) clearLineValidation(i)
}

const startPaint = (i: number, e: PointerEvent) => {
  if (e.button !== 0) return // right/middle click is handled by contextmenu (X mark)
  // Release the implicit pointer capture touch sets on pointerdown, so
  // pointerenter fires on the cells we drag across (otherwise touch paints
  // only the first cell).
  try {
    ;(e.target as Element).releasePointerCapture?.(e.pointerId)
  } catch {
    // no capture to release
  }
  if (solved.value) return
  const cur = marks.value[i]
  paintTo = mode.value === 'fill' ? (cur === 1 ? 0 : 1) : cur === 2 ? 0 : 2
  painting = true
  applyPaint(i)
}
const enterPaint = (i: number) => {
  if (painting) applyPaint(i)
}
const endPaint = () => {
  painting = false
}

const toggleX = (i: number) => {
  if (solved.value) return
  marks.value[i] = marks.value[i] === 2 ? 0 : 2
  clearLineValidation(i)
}

const share = async () => {
  const url = window.location.origin + route.fullPath
  await copyToClipboard(`Try this ${size.value}×${size.value} Nonogram:\n${url}`)
  snackbar.value = true
}

onMounted(() => {
  const p = typeof route.params.seed === 'string' ? route.params.seed : ''
  const m = /^(\d+)\.(.+)$/.exec(p)
  if (m && SIZES.includes(Number(m[1]))) {
    size.value = Number(m[1])
    const rest = m[2]
    if (rest.startsWith('@') && patternById(rest.slice(1), size.value)) {
      pattern.value = rest.slice(1)
    } else {
      code.value = rest
    }
    build()
  } else {
    newGame()
  }
  window.addEventListener('pointerup', endPaint)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointerup', endPaint)
})
</script>

<template>
  <v-container class="py-6" max-width="860">
    <GameToolbar title="Nonogram" shareable @share="share">
      <template #intro>
        Fill the cells so each row and column matches its run-length clues — the numbers count
        consecutive filled squares. A hidden picture emerges. Drag to paint; right-click to mark X.
      </template>
      <template #settings>
        <div class="d-flex flex-column ga-4">
          <div>
            <label class="text-caption text-medium-emphasis d-block mb-1">Size</label>
            <v-btn-toggle :model-value="size" mandatory density="compact" variant="outlined" divided @update:model-value="setSize">
              <v-btn v-for="s in SIZES" :key="s" :value="s" size="small">{{ s }}×{{ s }}</v-btn>
            </v-btn-toggle>
          </div>
          <div>
            <label class="text-caption text-medium-emphasis d-block mb-1">Picture</label>
            <v-select
              :model-value="pattern"
              :items="patternOptions"
              density="compact"
              variant="outlined"
              hide-details
              @update:model-value="setPattern"
            />
          </div>
          <div>
            <label class="text-caption text-medium-emphasis d-block mb-1">Fill color</label>
            <v-btn-toggle v-model="theme" mandatory density="compact" variant="outlined" divided>
              <v-btn v-for="t in THEMES" :key="t.id" :value="t.id" size="small" :title="t.label">
                <span class="swatch" :style="{ background: t.fill }" />
              </v-btn>
            </v-btn-toggle>
          </div>
          <v-btn variant="tonal" color="primary" prepend-icon="mdi-refresh" @click="newGame">New puzzle</v-btn>
        </div>
      </template>
      <template #info>
        <h3>Goal</h3>
        <p>Each clue lists the lengths of the filled runs in that row or column, in order, with at least one gap between runs. Deduce which cells are filled.</p>
        <h3>Controls</h3>
        <ul>
          <li>Tap or drag across cells to fill (or erase) them.</li>
          <li><span class="k">X</span> mode (or right-click) marks a cell you've deduced is empty — just an aid, it doesn't affect solving.</li>
          <li>Each clue number dims once its run is pinned in place.</li>
          <li><span class="k">Check</span> turns a line's clues red when your fills can no longer match it; the red clears the moment you edit that line.</li>
        </ul>
        <h3>Tips</h3>
        <ul>
          <li>Start with clues that nearly fill a line — they leave little freedom.</li>
          <li>Use X marks to lock in the gaps you're sure about.</li>
        </ul>
      </template>
    </GameToolbar>

    <!-- Mode toggle -->
    <div class="d-flex align-center ga-2 mb-3">
      <v-btn-toggle v-model="mode" mandatory density="comfortable" variant="outlined" divided>
        <v-btn value="fill" size="small" prepend-icon="mdi-square"> Fill </v-btn>
        <v-btn value="mark" size="small" prepend-icon="mdi-close"> Mark </v-btn>
      </v-btn-toggle>
      <v-btn
        variant="outlined"
        color="error"
        size="small"
        prepend-icon="mdi-check-decagram"
        :disabled="solved"
        @click="validate"
        >Check</v-btn
      >
      <v-spacer />
      <v-btn variant="tonal" color="primary" prepend-icon="mdi-refresh" @click="newGame">New</v-btn>
    </div>

    <div ref="boardEl" class="nono-wrap">
      <div class="nono" :style="gridStyle" @contextmenu.prevent>
        <!-- Corner -->
        <div class="corner" />
        <!-- Column clues -->
        <div v-for="(clue, c) in puzzle.colClues" :key="'c' + c" class="cclue" :class="{ 'clue--bad': colBad[c] }">
          <span v-for="(n, k) in clue" :key="k" :class="{ 'num--done': colSatisfied[c][k] }">{{ n }}</span>
        </div>
        <!-- Rows: row clue + cells -->
        <template v-for="r in rows" :key="'r' + r">
          <div class="rclue" :class="{ 'clue--bad': rowBad[r - 1] }">
            <span
              v-for="(n, k) in puzzle.rowClues[r - 1]"
              :key="k"
              :class="{ 'num--done': rowSatisfied[r - 1][k] }"
              >{{ n }}</span
            >
          </div>
          <div
            v-for="c in cols"
            :key="idx(r - 1, c - 1)"
            class="ncell"
            :class="{
              'ncell--fill': marks[idx(r - 1, c - 1)] === 1,
              'ncell--x': marks[idx(r - 1, c - 1)] === 2,
              'ncell--r5': (c - 1) % 5 === 0,
              'ncell--b5': (r - 1) % 5 === 0,
            }"
            @pointerdown.prevent="startPaint(idx(r - 1, c - 1), $event)"
            @pointerenter="enterPaint(idx(r - 1, c - 1))"
            @contextmenu.prevent="toggleX(idx(r - 1, c - 1))"
          >
            <span v-if="marks[idx(r - 1, c - 1)] === 2" class="x">✕</span>
          </div>
        </template>
      </div>

      <div v-if="solved" class="overlay">
        <p class="text-h4 mb-1">Solved! 🎉</p>
        <p class="text-body-1 mb-4">{{ size }}×{{ size }} picture complete.</p>
        <v-btn color="primary" variant="flat" prepend-icon="mdi-refresh" @click="newGame">New puzzle</v-btn>
      </div>
    </div>

    <v-snackbar v-model="snackbar" :timeout="2600" color="secondary">Puzzle link copied — share it!</v-snackbar>
  </v-container>
</template>

<style scoped>
.nono-wrap {
  position: relative;
  display: flex;
  justify-content: center;
}
.nono {
  display: grid;
  user-select: none;
  touch-action: none;
  background: rgba(2, 6, 23, 0.85);
  border: 2px solid rgba(148, 163, 184, 0.55);
  border-radius: 8px;
  overflow: hidden;
}

.corner {
  background: rgba(15, 23, 42, 0.6);
}

.cclue,
.rclue {
  display: flex;
  color: #cbd5e1;
  font-weight: 600;
  background: rgba(15, 23, 42, 0.35);
}
.cclue {
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  padding-bottom: 2px;
  gap: 1px;
  border-left: 1px solid rgba(148, 163, 184, 0.12);
}
.rclue {
  flex-direction: row;
  align-items: center;
  justify-content: flex-end;
  padding-right: 4px;
  gap: 4px;
  border-top: 1px solid rgba(148, 163, 184, 0.12);
}
/* Per-number greying: an individual clue entry dims once its run is pinned. */
.num--done {
  color: rgba(100, 116, 139, 0.5);
}
/* Validation: a line whose fills can no longer match its clue turns red until
   the player edits a square on that line. Overrides the dimmed state. */
.clue--bad span,
.clue--bad span.num--done {
  color: #f87171;
}

.ncell {
  display: flex;
  align-items: center;
  justify-content: center;
  border-left: 1px solid rgba(148, 163, 184, 0.16);
  border-top: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(148, 163, 184, 0.04);
  cursor: pointer;
}
.ncell--r5 { border-left-color: rgba(148, 163, 184, 0.5); }
.ncell--b5 { border-top-color: rgba(148, 163, 184, 0.5); }
.ncell--fill {
  background: var(--nono-fill, #7c3aed);
  box-shadow: inset 0 0 0 1px var(--nono-fill, #7c3aed);
}
.ncell--x { color: rgba(148, 163, 184, 0.7); }
.swatch {
  display: inline-block;
  width: 16px;
  height: 16px;
  border-radius: 3px;
  border: 1px solid rgba(255, 255, 255, 0.35);
}
.x {
  font-size: 0.8em;
  line-height: 1;
}

.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  background: rgba(2, 6, 23, 0.8);
  backdrop-filter: blur(3px);
  border-radius: 8px;
}
</style>
