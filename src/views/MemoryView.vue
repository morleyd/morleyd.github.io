<script setup lang="ts">
/**
 * Memory (Match) — a concentration board: flip face-down cards two at a time
 * to find all the matching pairs in as few moves as possible.
 * Logic (deck build, match rule, stars) lives in services/memory.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import GameToolbar from '@/components/GameToolbar.vue'
import {
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  type Difficulty,
  buildDeck,
  isMatch,
  matchStars,
  pairsFor,
} from '@/services/memory'

const FACES = ['🍎', '🌟', '🎈', '🐱', '🌸', '⚡', '🍕', '🎸', '🚀', '🎲', '🍩', '👾']

// --- Difficulty / size --------------------------------------------------
const difficulty = ref<Difficulty>('medium')
const difficultyLabels: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }
const pairs = computed(() => pairsFor(difficulty.value))

// --- Match --------------------------------------------------------------
const deck = ref<number[]>([])
const flipped = ref<number[]>([])
const matched = ref<Set<number>>(new Set())
const moves = ref(0)
const lockBoard = ref(false)

const matchCols = computed(() => (pairs.value <= 6 ? 4 : pairs.value <= 8 ? 4 : 5))
const matchWon = computed(() => deck.value.length > 0 && matched.value.size === deck.value.length)

let timers: ReturnType<typeof setTimeout>[] = []
const pushTimer = (t: ReturnType<typeof setTimeout>) => timers.push(t)
const clearTimers = () => {
  timers.forEach(clearTimeout)
  timers = []
}

const buildMatch = () => {
  clearTimers()
  deck.value = buildDeck(pairs.value, Math.random)
  flipped.value = []
  matched.value = new Set()
  moves.value = 0
  lockBoard.value = false
}

const isFaceUp = (i: number) => flipped.value.includes(i) || matched.value.has(i)

const flipCard = (i: number) => {
  if (lockBoard.value || isFaceUp(i) || flipped.value.length === 2) return
  flipped.value = [...flipped.value, i]
  if (flipped.value.length === 2) {
    moves.value += 1
    const [a, b] = flipped.value
    if (isMatch(deck.value, a, b)) {
      matched.value = new Set([...matched.value, a, b])
      flipped.value = []
    } else {
      lockBoard.value = true
      pushTimer(
        setTimeout(() => {
          flipped.value = []
          lockBoard.value = false
        }, 850),
      )
    }
  }
}

const newGame = () => buildMatch()

// Changing size starts a fresh board at the new size.
const setDifficulty = (d: Difficulty) => {
  difficulty.value = d
  buildMatch()
}

onMounted(buildMatch)
onBeforeUnmount(clearTimers)
</script>

<template>
  <v-container class="py-6" max-width="560">
    <GameToolbar title="Memory">
      <template #intro>
        Flip cards two at a time to find every matching pair. Clear the board in
        as few moves as you can.
      </template>
      <template #settings>
        <div class="d-flex flex-column ga-4">
          <div>
            <label class="text-caption text-medium-emphasis d-block mb-1">Difficulty</label>
            <v-btn-toggle :model-value="difficulty" mandatory density="compact" variant="outlined" divided @update:model-value="setDifficulty">
              <v-btn v-for="d in DIFFICULTY_ORDER" :key="d" :value="d" size="small">{{ difficultyLabels[d] }}</v-btn>
            </v-btn-toggle>
            <div class="text-caption text-medium-emphasis mt-1">
              {{ DIFFICULTIES[difficulty].pairs }} pairs
            </div>
          </div>
          <v-btn variant="tonal" color="primary" prepend-icon="mdi-refresh" @click="newGame">New game</v-btn>
        </div>
      </template>
      <template #info>
        <ul>
          <li>Tap a card to flip it, then a second. If they match they stay; otherwise they flip back.</li>
          <li>Clear the board in as few moves as possible — three stars for a near-perfect game.</li>
        </ul>
      </template>
    </GameToolbar>

    <div class="d-flex align-center justify-space-between mb-3">
      <div class="text-h6">Moves: <span class="font-weight-bold">{{ moves }}</span></div>
      <div class="text-body-2 text-medium-emphasis">{{ matched.size / 2 }} / {{ pairs }} pairs</div>
    </div>
    <div class="match-board" :style="{ gridTemplateColumns: `repeat(${matchCols}, 1fr)` }">
      <button
        v-for="(v, i) in deck"
        :key="i"
        type="button"
        class="card"
        :class="{ 'card--up': isFaceUp(i), 'card--done': matched.has(i) }"
        @click="flipCard(i)"
      >
        <span class="card-face">{{ isFaceUp(i) ? FACES[v] : '' }}</span>
      </button>
    </div>
    <div v-if="matchWon" class="result mt-4">
      <p class="text-h5 mb-1">Cleared! 🎉</p>
      <p class="stars mb-2">
        <v-icon v-for="s in 3" :key="s" :icon="s <= matchStars(pairs, moves) ? 'mdi-star' : 'mdi-star-outline'" color="amber" />
      </p>
      <p class="text-body-2 mb-3">{{ moves }} moves</p>
      <v-btn color="primary" variant="flat" prepend-icon="mdi-refresh" @click="buildMatch">Play again</v-btn>
    </div>
  </v-container>
</template>

<style scoped>
.match-board {
  display: grid;
  gap: 8px;
  max-width: 460px;
  margin: 0 auto;
}
.card {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: linear-gradient(135deg, rgba(124, 58, 237, 0.5), rgba(45, 212, 191, 0.25));
  cursor: pointer;
  font-size: clamp(1.4rem, 8vw, 2.2rem);
  transition: transform 120ms ease, background 120ms ease;
}
.card--up {
  background: rgba(30, 41, 59, 0.9);
  transform: rotateY(0);
}
.card--done {
  opacity: 0.55;
  background: rgba(34, 197, 94, 0.2);
  cursor: default;
}
.card-face {
  line-height: 1;
}

.result {
  text-align: center;
}
.stars {
  font-size: 1.6rem;
}
</style>
