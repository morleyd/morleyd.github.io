<script setup lang="ts">
/**
 * Wordle Helper — a standalone solver.
 * Enter the words you've guessed, tap each tile to mark it gray/yellow/green,
 * and the list of still-possible answers updates live.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { answerBank } from '@/services/wordLists'
import { filterCandidates } from '@/services/analyzer'
import {
  MAX_ATTEMPTS,
  WORD_LENGTH,
  evaluateGuess,
  statusesToPattern,
} from '@/services/wordleLogic'
import type { LetterStatus } from '@/services/wordleLogic'

interface HelperTile {
  letter: string
  status: LetterStatus
}

const keyboardRows = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M', 'BACK'],
] as const

// Tap order for a tile's colour: gray -> yellow -> green -> gray
const STATUS_CYCLE: LetterStatus[] = ['absent', 'present', 'correct']

const createRows = (): HelperTile[][] =>
  Array.from({ length: MAX_ATTEMPTS }, () =>
    Array.from({ length: WORD_LENGTH }, () => ({ letter: '', status: 'absent' as LetterStatus })),
  )

const rows = ref<HelperTile[][]>(createRows())

const hasInput = computed(() => rows.value.some((row) => row.some((tile) => tile.letter !== '')))

/** Rows where all five tiles have a letter — only these constrain the search. */
const completeRows = computed(() =>
  rows.value.filter((row) => row.every((tile) => tile.letter !== '')),
)

/** Answers still consistent with every completed row. */
const candidates = computed(() => {
  let pool = answerBank
  for (const row of completeRows.value) {
    const guess = row.map((tile) => tile.letter).join('')
    const statuses = row.map((tile) => tile.status)
    pool = filterCandidates(pool, guess, statuses)
  }
  return pool
})

/** Expected information (bits) a guess yields against the current candidate set. */
const expectedInfo = (guess: string, pool: string[]): number => {
  const counts = new Map<string, number>()
  for (const answer of pool) {
    const pattern = statusesToPattern(evaluateGuess(guess, answer))
    counts.set(pattern, (counts.get(pattern) ?? 0) + 1)
  }
  const total = pool.length
  let bits = 0
  for (const count of counts.values()) {
    const p = count / total
    bits += p * Math.log2(1 / p)
  }
  return bits
}

const SUGGESTION_LIMIT = 600

/** Best next guesses (among remaining candidates) once the pool is small enough. */
const suggestions = computed(() => {
  const pool = candidates.value
  if (pool.length < 2 || pool.length > SUGGESTION_LIMIT) {
    return []
  }
  return pool
    .map((word) => ({ word, info: expectedInfo(word, pool) }))
    .sort((a, b) => b.info - a.info)
    .slice(0, 6)
})

function typeLetter(letter: string) {
  for (const row of rows.value) {
    for (const tile of row) {
      if (!tile.letter) {
        tile.letter = letter
        return
      }
    }
  }
}

function backspace() {
  for (let r = rows.value.length - 1; r >= 0; r -= 1) {
    for (let c = WORD_LENGTH - 1; c >= 0; c -= 1) {
      const tile = rows.value[r][c]
      if (tile.letter) {
        tile.letter = ''
        tile.status = 'absent'
        return
      }
    }
  }
}

function cycleTile(tile: HelperTile) {
  if (!tile.letter) {
    return
  }
  const next = (STATUS_CYCLE.indexOf(tile.status) + 1) % STATUS_CYCLE.length
  tile.status = STATUS_CYCLE[next]
}

function handleKey(key: string) {
  if (key === 'BACK') {
    backspace()
  } else if (/^[A-Z]$/.test(key)) {
    typeLetter(key)
  }
}

function reset() {
  rows.value = createRows()
}

function handlePhysicalKey(event: KeyboardEvent) {
  if (event.metaKey || event.ctrlKey || event.altKey) {
    return
  }
  const key = event.key.toUpperCase()
  if (key === 'BACKSPACE') {
    event.preventDefault()
    backspace()
  } else if (/^[A-Z]$/.test(key)) {
    typeLetter(key)
  }
}

onMounted(() => window.addEventListener('keyup', handlePhysicalKey))
onBeforeUnmount(() => window.removeEventListener('keyup', handlePhysicalKey))
</script>

<template>
  <v-main class="helper-main">
    <v-card class="pa-6 helper-card" max-width="720" elevation="8">
      <div class="text-center mb-4">
        <h1 class="text-h4 font-weight-bold mb-1">Wordle Helper</h1>
        <p class="text-body-2 text-grey-lighten-1">
          Type your guesses, then tap each tile to set its colour. The list of possible
          words updates as you go.
        </p>
      </div>

      <!-- Colour legend -->
      <div class="d-flex justify-center flex-wrap ga-4 mb-4 text-caption">
        <span class="d-flex align-center ga-1"><span class="swatch swatch--absent" /> Not in word</span>
        <span class="d-flex align-center ga-1"><span class="swatch swatch--present" /> Wrong spot</span>
        <span class="d-flex align-center ga-1"><span class="swatch swatch--correct" /> Correct spot</span>
      </div>

      <!-- Editable grid -->
      <div class="helper-grid mb-4" aria-label="Guess grid">
        <div v-for="(row, rowIndex) in rows" :key="`row-${rowIndex}`" class="helper-row">
          <button
            v-for="(tile, colIndex) in row"
            :key="`tile-${rowIndex}-${colIndex}`"
            type="button"
            class="helper-tile"
            :class="[`helper-tile--${tile.status}`, { 'helper-tile--filled': tile.letter !== '' }]"
            :aria-label="tile.letter ? `${tile.letter}, tap to change colour` : 'empty'"
            @click="cycleTile(tile)"
          >
            {{ tile.letter }}
          </button>
        </div>
      </div>

      <!-- On-screen keyboard -->
      <div class="helper-keyboard mb-4" aria-label="On-screen keyboard">
        <div v-for="(row, i) in keyboardRows" :key="`kb-${i}`" class="keyboard-row">
          <v-btn
            v-for="key in row"
            :key="key"
            class="keyboard-key"
            color="blue-darken-4"
            variant="flat"
            height="48"
            @click="handleKey(key)"
          >
            <template v-if="key === 'BACK'">
              <v-icon icon="mdi-backspace-outline" />
            </template>
            <template v-else>{{ key }}</template>
          </v-btn>
        </div>
      </div>

      <div class="d-flex justify-center mb-4">
        <v-btn variant="text" prepend-icon="mdi-refresh" :disabled="!hasInput" @click="reset">
          Reset
        </v-btn>
      </div>

      <v-divider class="mb-4" />

      <!-- Results -->
      <div v-if="!hasInput" class="text-center text-grey-lighten-1 text-body-2">
        Enter a guess above to see matching words.
      </div>

      <template v-else>
        <div v-if="suggestions.length" class="mb-4">
          <p class="text-subtitle-2 mb-2">Suggested next guesses</p>
          <div class="d-flex flex-wrap ga-2">
            <v-chip v-for="s in suggestions" :key="s.word" color="purple-lighten-1" variant="flat">
              {{ s.word }} <span class="text-caption ml-1 text-medium-emphasis">{{ s.info.toFixed(1) }} bits</span>
            </v-chip>
          </div>
        </div>

        <p class="text-subtitle-2 mb-2">
          {{ candidates.length }} possible {{ candidates.length === 1 ? 'word' : 'words' }}
        </p>
        <div v-if="candidates.length === 0" class="text-error text-body-2">
          No words match — double-check the tile colours.
        </div>
        <v-virtual-scroll v-else :items="candidates" height="280" class="helper-results">
          <template #default="{ item }">
            <div class="helper-result-item">{{ item }}</div>
          </template>
        </v-virtual-scroll>
      </template>
    </v-card>
  </v-main>
</template>

<style scoped>
.helper-main {
  background: radial-gradient(circle at top, rgba(45, 212, 191, 0.08), transparent 60%), #020617;
  min-height: 100vh;
  display: flex;
  align-items: flex-start;
  justify-content: center;
}

.helper-card {
  width: 100%;
  background: rgba(15, 23, 42, 0.92);
  border: 1px solid rgba(148, 163, 184, 0.12);
  color: #e2e8f0;
}

.swatch {
  display: inline-block;
  width: 14px;
  height: 14px;
  border-radius: 3px;
}
.swatch--absent { background: rgba(71, 85, 105, 0.9); }
.swatch--present { background: #eab308; }
.swatch--correct { background: #22c55e; }

.helper-grid {
  display: grid;
  row-gap: 8px;
}

.helper-row {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 60px));
  gap: 8px;
  justify-content: center;
}

.helper-tile {
  aspect-ratio: 1 / 1;
  border: 2px solid rgba(148, 163, 184, 0.25);
  border-radius: 10px;
  font-size: 1.4rem;
  font-weight: 700;
  color: #e2e8f0;
  text-transform: uppercase;
  background: rgba(15, 23, 42, 0.6);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.helper-tile--filled {
  border-color: rgba(148, 163, 184, 0.7);
}
.helper-tile--present {
  background: #eab308;
  border-color: #eab308;
  color: #2b1a00;
}
.helper-tile--correct {
  background: #22c55e;
  border-color: #22c55e;
  color: #032311;
}

.helper-keyboard {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.keyboard-row {
  display: flex;
  gap: 6px;
  justify-content: center;
  flex-wrap: nowrap;
}

.keyboard-key {
  min-width: 32px;
  flex: 1 1 0;
  max-width: 46px;
  font-weight: 600;
}

.helper-results {
  border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 8px;
}

.helper-result-item {
  padding: 6px 12px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  border-bottom: 1px solid rgba(148, 163, 184, 0.08);
}

@media (max-width: 600px) {
  .helper-row {
    grid-template-columns: repeat(5, minmax(0, 52px));
    gap: 6px;
  }
  .keyboard-key {
    min-width: 26px;
    font-size: 0.8rem;
  }
}
</style>
