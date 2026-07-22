<script setup lang="ts">
/**
 * Simon — watch a growing color sequence and repeat it back. Each round adds
 * one more step; a single wrong tap ends the run. Difficulty controls how many
 * pads (and tones) are in play. Sequence/check logic lives in services/memory,
 * the pad tones in services/memoryAudio.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import GameToolbar from '@/components/GameToolbar.vue'
import {
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  type Difficulty,
  checkSimon,
  extendSequence,
  padsFor,
} from '@/services/memory'
import { SimonAudio } from '@/services/memoryAudio'

// Colors + labels for pad 0..MAX_SIMON_PADS-1 (harder difficulties use more).
const PAD_LABELS = ['green', 'red', 'yellow', 'blue', 'purple', 'cyan']
const SIMON_BEST_KEY = 'simon-best'

// --- Difficulty / size --------------------------------------------------
// The preset controls how many pads light up.
const difficulty = ref<Difficulty>('medium')
const difficultyLabels: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }
const pads = computed(() => padsFor(difficulty.value))
const simonCols = computed(() => (pads.value <= 4 ? 2 : 3))

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

const newGame = () => {
  clearTimers()
  startSimon()
}

// Changing size resets to a fresh idle game at the new pad count.
const setDifficulty = (d: Difficulty) => {
  difficulty.value = d
  clearTimers()
  simonState.value = 'idle'
  activePad.value = -1
  sequence.value = []
  simonInput.value = []
}

onMounted(() => {
  try {
    simonBest.value = Number(localStorage.getItem(SIMON_BEST_KEY)) || 0
  } catch {
    simonBest.value = 0
  }
})
onBeforeUnmount(() => {
  clearTimers()
  audio.dispose()
})
</script>

<template>
  <v-container class="py-6" max-width="560">
    <GameToolbar title="Simon">
      <template #intro>
        Watch the color sequence, then repeat it — it grows by one step each round.
        How far can you get?
      </template>
      <template #settings>
        <div class="d-flex flex-column ga-4">
          <div>
            <label class="text-caption text-medium-emphasis d-block mb-1">Difficulty</label>
            <v-btn-toggle :model-value="difficulty" mandatory density="compact" variant="outlined" divided @update:model-value="setDifficulty">
              <v-btn v-for="d in DIFFICULTY_ORDER" :key="d" :value="d" size="small">{{ difficultyLabels[d] }}</v-btn>
            </v-btn-toggle>
            <div class="text-caption text-medium-emphasis mt-1">
              {{ DIFFICULTIES[difficulty].pads }} pads
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
        <ul>
          <li>Watch the pads light up, then tap them back in the same order.</li>
          <li>Each round adds one more step. One wrong tap ends the run.</li>
          <li>Harder difficulties add more pads (and tones) to track.</li>
        </ul>
      </template>
    </GameToolbar>

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
  </v-container>
</template>

<style scoped>
.result {
  text-align: center;
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
