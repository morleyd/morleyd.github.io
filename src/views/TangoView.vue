<script setup lang="ts">
/**
 * Tango — a 6×6 fill-the-grid logic puzzle. Each cell is a Sun or Moon. Balance
 * every row and column (three each), never place three of a kind in a row, and
 * honor the "=" (equal) and "×" (opposite) badges between neighbors. Seeded and
 * shareable. Generation/checking live in services/tango.
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import GameToolbar from '@/components/GameToolbar.vue'
import { copyToClipboard } from '@/services/share'
import { randomSeed } from '@/services/seed'
import { useSquareFit } from '@/composables/useSquareFit'
import {
  CELLS,
  EMPTY,
  MOON,
  SIZE,
  SUN,
  findConflicts,
  generateTango,
  isSolved,
  type Constraint,
  type Grid,
} from '@/services/tango'
import { findHint, symbolName, type Hint } from '@/services/tangoHints'

// Reserve just enough below the board for the hint alert + page padding, so the
// board can grow to fill most of the viewport height.
const { el: boardEl, px: boardPx } = useSquareFit(96)
const cell = computed(() => boardPx.value / SIZE)

const route = useRoute()
const router = useRouter()

const code = ref('')
const cells = ref<Grid>(new Array(CELLS).fill(EMPTY))
const given = ref<boolean[]>([])
const solution = ref<Grid>([])
const constraints = ref<Constraint[]>([])
const snackbar = ref(false)

// Progressive hint state: level 0 = idle, 1 = region shown, 2 = exact cell shown,
// 3 = value revealed (then it resets). The hint is computed once when it starts
// and held steady across levels; any board change clears it.
const hint = ref<Hint | null>(null)
const hintLevel = ref(0)
const noHint = ref(false)

const clearHint = () => {
  hint.value = null
  hintLevel.value = 0
  noHint.value = false
}

const hintRegion = computed(() =>
  hint.value && hintLevel.value >= 1 ? new Set(hint.value.region.concat(hint.value.because)) : new Set<number>(),
)
const hintCell = computed(() => (hint.value && hintLevel.value >= 2 ? hint.value.cell : null))

const hintMessage = computed(() => {
  if (noHint.value) return 'No single-step deduction from here — try filling in what you know, then ask again.'
  const h = hint.value
  if (!h) return ''
  if (hintLevel.value === 1) return `${h.reason} (Hint again to pinpoint the cell.)`
  if (hintLevel.value === 2) return 'This exact cell is forced. Hint again to reveal its value.'
  if (hintLevel.value >= 3) return `${h.reason.split(':')[0]}: this cell must be a ${symbolName(h.value)}.`
  return ''
})

const conflicts = computed(() => findConflicts(cells.value, constraints.value))
const solved = computed(() => cells.value.length > 0 && isSolved(cells.value, constraints.value))

// Badge positions between constrained neighbors, in board pixels.
const badges = computed(() =>
  constraints.value.map((con) => {
    const [ra, ca] = [Math.floor(con.a / SIZE), con.a % SIZE]
    const horizontal = con.b === con.a + 1
    const x = horizontal ? (ca + 1) * cell.value : (ca + 0.5) * cell.value
    const y = horizontal ? (ra + 0.5) * cell.value : (ra + 1) * cell.value
    return { x, y, symbol: con.kind === 'eq' ? '=' : '×' }
  }),
)

const build = () => {
  const puzzle = generateTango(code.value)
  cells.value = puzzle.given.slice()
  given.value = puzzle.given.map((v) => v !== EMPTY)
  solution.value = puzzle.solution.slice()
  constraints.value = puzzle.constraints
  clearHint()
}

const syncUrl = () => router.replace({ name: 'tango', params: { seed: code.value } })
const newGame = () => {
  code.value = randomSeed()
  syncUrl()
  build()
}

const cycle = (i: number) => {
  if (given.value[i] || solved.value) return
  const next = cells.value.slice()
  next[i] = next[i] === EMPTY ? SUN : next[i] === SUN ? MOON : EMPTY
  cells.value = next
  clearHint() // the board changed — any pending hint is stale
}

// Step the hint through its reveal levels: compute on first press, then
// region → cell → value; the final step fills the forced cell.
const nextHint = () => {
  if (solved.value) return
  if (!hint.value) {
    const found = findHint(cells.value, constraints.value)
    if (!found) {
      noHint.value = true
      return
    }
    hint.value = found
    hintLevel.value = 1
    return
  }
  if (hintLevel.value < 3) {
    hintLevel.value += 1
    if (hintLevel.value === 3) {
      const next = cells.value.slice()
      next[hint.value.cell] = hint.value.value
      cells.value = next // fill applied without clearHint so the reveal message stays
    }
    return
  }
  // Level 3 already shown — move on to the next deduction.
  clearHint()
  nextHint()
}

const share = async () => {
  const url = window.location.origin + route.fullPath
  await copyToClipboard(`Try this Tango puzzle:\n${url}`)
  snackbar.value = true
}

onMounted(() => {
  const p = typeof route.params.seed === 'string' ? route.params.seed : ''
  if (p) {
    code.value = p
    build()
  } else {
    newGame()
  }
})

const cellClass = (i: number) => ({
  'tcell--given': given.value[i],
  'tcell--conflict': conflicts.value.has(i),
  'tcell--hint-region': hintRegion.value.has(i) && hintCell.value !== i,
  'tcell--hint-cell': hintCell.value === i,
})
</script>

<template>
  <v-container class="py-6" max-width="720">
    <GameToolbar title="Tango" shareable @share="share">
      <template #intro>
        Fill every cell with a Sun or a Moon. Each row and column needs three of each, no three of a
        kind may sit in a row, and the <strong>=</strong> / <strong>×</strong> badges link neighbors.
        Tap a cell to cycle Sun → Moon → empty.
      </template>
      <template #settings>
        <v-btn variant="tonal" color="primary" prepend-icon="mdi-refresh" @click="newGame">New puzzle</v-btn>
      </template>
      <template #info>
        <h3>Goal</h3>
        <p>Complete the grid so it obeys every rule at once.</p>
        <h3>Rules</h3>
        <ul>
          <li>Each row and each column has exactly three Suns and three Moons.</li>
          <li>No three of the same symbol are next to each other, across or down.</li>
          <li><strong>=</strong> between two cells: they must match. <strong>×</strong>: they must differ.</li>
        </ul>
        <h3>Tips</h3>
        <ul>
          <li>Every puzzle is solvable by logic alone — no guessing needed.</li>
          <li>A pair of same symbols forces the cells on either side to be the opposite.</li>
        </ul>
      </template>
    </GameToolbar>

    <div class="controls d-flex align-center ga-2 mb-4">
      <v-spacer />
      <v-btn variant="tonal" prepend-icon="mdi-lightbulb-on-outline" :disabled="solved" @click="nextHint">Hint</v-btn>
      <v-btn variant="tonal" color="primary" prepend-icon="mdi-refresh" @click="newGame">New</v-btn>
    </div>

    <div ref="boardEl" class="board-wrap" :style="{ width: boardPx + 'px', height: boardPx + 'px' }">
      <div
        class="board"
        :style="{
          gridTemplateColumns: `repeat(${SIZE}, 1fr)`,
          gridTemplateRows: `repeat(${SIZE}, 1fr)`,
        }"
      >
        <button
          v-for="(v, i) in cells"
          :key="i"
          type="button"
          class="tcell"
          :class="cellClass(i)"
          @click="cycle(i)"
        >
          <v-icon v-if="v === SUN" icon="mdi-white-balance-sunny" class="sun" :size="cell * 0.6" />
          <v-icon v-else-if="v === MOON" icon="mdi-moon-waning-crescent" class="moon" :size="cell * 0.6" />
        </button>
      </div>

      <!-- Constraint badges between neighbors -->
      <div
        v-for="(b, k) in badges"
        :key="k"
        class="badge"
        :style="{ left: b.x + 'px', top: b.y + 'px' }"
      >{{ b.symbol }}</div>

      <div v-if="solved" class="overlay">
        <p class="text-h4 mb-1">Solved! 🎉</p>
        <p class="text-body-1 mb-4">Every rule satisfied.</p>
        <v-btn color="primary" variant="flat" prepend-icon="mdi-refresh" @click="newGame">New puzzle</v-btn>
      </div>
    </div>

    <v-alert
      v-if="hintMessage"
      class="mt-4"
      density="comfortable"
      variant="tonal"
      :color="noHint ? 'warning' : 'info'"
      icon="mdi-lightbulb-on-outline"
    >{{ hintMessage }}</v-alert>

    <v-snackbar v-model="snackbar" :timeout="2600" color="secondary">Puzzle link copied — share it!</v-snackbar>
  </v-container>
</template>

<style scoped>
/* The controls sit above the board in the stacking order so an edge badge can
   never paint over the Hint/New buttons. */
.controls {
  position: relative;
  z-index: 1;
}
.board-wrap {
  position: relative;
  margin: 0 auto;
  /* Contain the badges' z-index inside the board so they can never rise above
     the controls above them (belt-and-suspenders with the gap between them). */
  isolation: isolate;
}
.board {
  display: grid;
  gap: 0;
  width: 100%;
  height: 100%;
  border: 2px solid rgba(148, 163, 184, 0.55);
  border-radius: 8px;
  overflow: hidden;
  background: rgba(2, 6, 23, 0.85);
  user-select: none;
}
.tcell {
  /* Square cells: the 6×6 grid tracks (1fr rows + columns inside a square wrapper)
     already size each cell to boardPx/6; aspect-ratio keeps them square even if a
     browser lays the tracks out early, before the wrapper's height is applied. */
  aspect-ratio: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(148, 163, 184, 0.03);
  cursor: pointer;
  transition: background 90ms ease;
}
.tcell--given {
  background: rgba(148, 163, 184, 0.14);
  cursor: default;
}
.tcell--conflict {
  background: rgba(248, 113, 113, 0.22);
}
.tcell--hint-region {
  background: rgba(59, 130, 246, 0.16);
}
.tcell--hint-cell {
  background: rgba(59, 130, 246, 0.42);
  box-shadow: inset 0 0 0 2px #60a5fa;
}
.sun {
  color: #facc15;
}
.moon {
  color: #818cf8;
}

.badge {
  position: absolute;
  transform: translate(-50%, -50%);
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 0.95rem;
  color: #0f172a;
  background: #e2e8f0;
  border-radius: 50%;
  box-shadow: 0 0 0 2px rgba(2, 6, 23, 0.85);
  pointer-events: none;
  z-index: 2;
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
  /* Above the constraint badges (z-index: 2) so the win scrim covers them. */
  z-index: 3;
}
</style>

