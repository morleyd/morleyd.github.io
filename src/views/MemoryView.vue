<script setup lang="ts">
/**
 * Memory — two quick memory games in one, chosen with a toggle:
 *  - Match: flip face-down cards two at a time to find all the pairs.
 *  - Simon: watch a growing color sequence and repeat it back.
 * Logic (deck build, match rule, stars, sequence check) lives in services/memory.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import GameToolbar from '@/components/GameToolbar.vue'
import {
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  type Difficulty,
  buildDeck,
  checkSimon,
  extendSequence,
  isMatch,
  matchStars,
  padsFor,
  pairsFor,
} from '@/services/memory'
import { SimonAudio } from '@/services/memoryAudio'

const FACES = ['🍎', '🌟', '🎈', '🐱', '🌸', '⚡', '🍕', '🎸', '🚀', '🎲', '🍩', '👾']
// Colors + labels for pad 0..MAX_SIMON_PADS-1 (harder difficulties use more).
const PAD_LABELS = ['green', 'red', 'yellow', 'blue', 'purple', 'cyan']
const SIMON_BEST_KEY = 'simon-best'

const mode = ref<'match' | 'simon'>('match')

// --- Difficulty / size --------------------------------------------------
// One preset drives both modes: Match pairs and the number of Simon pads.
const difficulty = ref<Difficulty>('medium')
const difficultyLabels: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }
const pairs = computed(() => pairsFor(difficulty.value))
const pads = computed(() => padsFor(difficulty.value))
const simonCols = computed(() => (pads.value <= 4 ? 2 : 3))

// --- Match --------------------------------------------------------------
const deck = ref<number[]>([])
const flipped = ref<number[]>([])
const matched = ref<Set<number>>(new Set())
const moves = ref(0)
const lockBoard = ref(false)

const matchCols = computed(() => (pairs.value <= 6 ? 4 : pairs.value <= 8 ? 4 : 5))
const matchWon = computed(() => deck.value.length > 0 && matched.value.size === deck.value.length)

const buildMatch = () => {
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

// --- Simon --------------------------------------------------------------
const sequence = ref<number[]>([])
const simonInput = ref<number[]>([])
const simonState = ref<'idle' | 'show' | 'input' | 'over'>('idle')
const activePad = ref(-1)
const simonBest = ref(0)

// Web Audio tones — one per pad. Guarded so tests/SSR (no AudioContext) no-op.
const audio = new SimonAudio()
const muted = ref(false)
const audioAvailable = audio.available
const toggleMute = () => {
  muted.value = !muted.value
  audio.muted = muted.value
}

const simonLevel = computed(() => sequence.value.length)

let timers: ReturnType<typeof setTimeout>[] = []
const pushTimer = (t: ReturnType<typeof setTimeout>) => timers.push(t)
const clearTimers = () => {
  timers.forEach(clearTimeout)
  timers = []
}

const playSequence = () => {
  simonState.value = 'show'
  activePad.value = -1
  let i = 0
  const step = () => {
    if (i >= sequence.value.length) {
      simonState.value = 'input'
      simonInput.value = []
      return
    }
    activePad.value = sequence.value[i]
    audio.play(activePad.value, 420)
    pushTimer(
      setTimeout(() => {
        activePad.value = -1
        i += 1
        pushTimer(setTimeout(step, 220))
      }, 460),
    )
  }
  pushTimer(setTimeout(step, 420))
}

const persistSimonBest = () => {
  const reached = sequence.value.length - 1 // completed rounds
  if (reached > simonBest.value) {
    simonBest.value = reached
    try {
      localStorage.setItem(SIMON_BEST_KEY, String(simonBest.value))
    } catch {
      // ignore
    }
  }
}

const startSimon = () => {
  audio.resume() // first gesture — unlock/resume the AudioContext
  clearTimers()
  sequence.value = extendSequence([], Math.random, pads.value)
  simonInput.value = []
  simonState.value = 'show'
  playSequence()
}

const flashPad = (p: number) => {
  activePad.value = p
  pushTimer(
    setTimeout(() => {
      if (activePad.value === p) activePad.value = -1
    }, 180),
  )
}

const tapPad = (p: number) => {
  if (simonState.value !== 'input') return
  audio.resume() // keep the context alive; safe to call repeatedly
  audio.play(p, 220)
  flashPad(p)
  simonInput.value = [...simonInput.value, p]
  const result = checkSimon(sequence.value, simonInput.value)
  if (result === 'wrong') {
    persistSimonBest()
    simonState.value = 'over'
    clearTimers()
  } else if (result === 'complete') {
    simonState.value = 'show'
    pushTimer(
      setTimeout(() => {
        sequence.value = extendSequence(sequence.value, Math.random, pads.value)
        playSequence()
      }, 650),
    )
  }
}

// --- Shared -------------------------------------------------------------
const setMode = (m: 'match' | 'simon') => {
  mode.value = m
  clearTimers()
  simonState.value = 'idle'
  activePad.value = -1 // clear any pad left lit by an interrupted playback
  buildMatch()
}

const newGame = () => {
  clearTimers()
  if (mode.value === 'match') buildMatch()
  else startSimon()
}

// Changing size starts a fresh game at the new size in whichever mode is active.
const setDifficulty = (d: Difficulty) => {
  difficulty.value = d
  clearTimers()
  if (mode.value === 'match') {
    buildMatch()
  } else {
    simonState.value = 'idle'
    activePad.value = -1
    sequence.value = []
    simonInput.value = []
  }
}

onMounted(() => {
  try {
    simonBest.value = Number(localStorage.getItem(SIMON_BEST_KEY)) || 0
  } catch {
    simonBest.value = 0
  }
  buildMatch()
})
onBeforeUnmount(() => {
  clearTimers()
  audio.dispose()
})
</script>

<template>
  <v-container class="py-6" max-width="560">
    <GameToolbar title="Memory">
      <template #intro>
        Two memory games in one. <strong>Match</strong>: flip cards two at a time to find the pairs.
        <strong>Simon</strong>: watch the color sequence, then repeat it — it grows each round.
      </template>
      <template #settings>
        <div class="d-flex flex-column ga-4">
          <div>
            <label class="text-caption text-medium-emphasis d-block mb-1">Difficulty</label>
            <v-btn-toggle :model-value="difficulty" mandatory density="compact" variant="outlined" divided @update:model-value="setDifficulty">
              <v-btn v-for="d in DIFFICULTY_ORDER" :key="d" :value="d" size="small">{{ difficultyLabels[d] }}</v-btn>
            </v-btn-toggle>
            <div class="text-caption text-medium-emphasis mt-1">
              {{ DIFFICULTIES[difficulty].pairs }} pairs · {{ DIFFICULTIES[difficulty].pads }} Simon pads
            </div>
          </div>
          <v-btn
            v-if="audioAvailable"
            variant="tonal"
            :color="muted ? undefined : 'primary'"
            :prepend-icon="muted ? 'mdi-volume-off' : 'mdi-volume-high'"
            @click="toggleMute"
          >
            {{ muted ? 'Sound off' : 'Sound on' }}
          </v-btn>
          <v-btn variant="tonal" color="primary" prepend-icon="mdi-refresh" @click="newGame">New game</v-btn>
        </div>
      </template>
      <template #info>
        <h3>Match</h3>
        <ul>
          <li>Tap a card to flip it, then a second. If they match they stay; otherwise they flip back.</li>
          <li>Clear the board in as few moves as possible — three stars for a near-perfect game.</li>
        </ul>
        <h3>Simon</h3>
        <ul>
          <li>Watch the pads light up, then tap them back in the same order.</li>
          <li>Each round adds one more step. One wrong tap ends the run.</li>
        </ul>
      </template>
    </GameToolbar>

    <!-- Mode toggle -->
    <div class="d-flex align-center ga-2 mb-4">
      <v-btn-toggle :model-value="mode" mandatory density="comfortable" variant="outlined" divided @update:model-value="setMode">
        <v-btn value="match" size="small" prepend-icon="mdi-cards-outline">Match</v-btn>
        <v-btn value="simon" size="small" prepend-icon="mdi-view-grid">Simon</v-btn>
      </v-btn-toggle>
      <v-spacer />
      <v-btn variant="tonal" color="primary" prepend-icon="mdi-refresh" @click="newGame">New</v-btn>
    </div>

    <!-- Match mode -->
    <template v-if="mode === 'match'">
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
    </template>

    <!-- Simon mode -->
    <template v-else>
      <div class="d-flex align-center justify-space-between mb-3">
        <div class="text-h6">Level: <span class="font-weight-bold">{{ simonState === 'idle' ? 0 : simonLevel }}</span></div>
        <div class="text-body-2 text-medium-emphasis">Best: {{ simonBest }}</div>
      </div>
      <div class="simon" :style="{ gridTemplateColumns: `repeat(${simonCols}, 1fr)` }">
        <button
          v-for="p in pads"
          :key="p"
          type="button"
          class="pad"
          :class="[`pad--${p - 1}`, { 'pad--active': activePad === p - 1 }]"
          :aria-label="PAD_LABELS[p - 1]"
          :disabled="simonState !== 'input'"
          @pointerdown="tapPad(p - 1)"
        />
        <div class="simon-center">
          <span v-if="simonState === 'show'" class="text-caption">Watch…</span>
          <span v-else-if="simonState === 'input'" class="text-caption">Your turn</span>
        </div>
      </div>
      <div class="result mt-4">
        <template v-if="simonState === 'idle'">
          <v-btn color="primary" variant="flat" @click="startSimon">Start</v-btn>
        </template>
        <template v-else-if="simonState === 'over'">
          <p class="text-h6 mb-1">Game over</p>
          <p class="text-body-2 mb-3">You reached level {{ sequence.length - 1 }}.</p>
          <v-btn color="primary" variant="flat" prepend-icon="mdi-restart" @click="startSimon">Try again</v-btn>
        </template>
      </div>
    </template>
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

.simon {
  position: relative;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  max-width: 340px;
  margin: 0 auto;
}
.pad {
  border: none;
  border-radius: 14px;
  cursor: pointer;
  opacity: 0.55;
  aspect-ratio: 1;
  transition: opacity 90ms ease, transform 90ms ease, box-shadow 90ms ease;
}
.pad:disabled {
  cursor: default;
}
.pad--active {
  opacity: 1;
  transform: scale(0.97);
}
.pad--0 { background: #22c55e; }
.pad--1 { background: #ef4444; }
.pad--2 { background: #facc15; }
.pad--3 { background: #3b82f6; }
.pad--4 { background: #a855f7; }
.pad--5 { background: #06b6d4; }
.pad--active.pad--0 { box-shadow: 0 0 30px #22c55e; }
.pad--active.pad--1 { box-shadow: 0 0 30px #ef4444; }
.pad--active.pad--2 { box-shadow: 0 0 30px #facc15; }
.pad--active.pad--3 { box-shadow: 0 0 30px #3b82f6; }
.pad--active.pad--4 { box-shadow: 0 0 30px #a855f7; }
.pad--active.pad--5 { box-shadow: 0 0 30px #06b6d4; }

.simon-center {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  color: #e2e8f0;
}
</style>
