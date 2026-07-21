<script setup lang="ts">
/**
 * Nerdle — Wordle for arithmetic. Guess the hidden 8-tile equation in six tries;
 * each tile is scored correct / wrong-place / absent. Guesses must be true,
 * well-formed equations. Seeded and shareable. Logic lives in services/nerdle.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import GameToolbar from '@/components/GameToolbar.vue'
import { copyToClipboard } from '@/services/share'
import { randomSeed } from '@/services/seed'
import {
  MAX_GUESSES,
  WIDTH,
  generateEquation,
  isValidEquation,
  mergeKeyStatuses,
  scoreGuess,
  type TileStatus,
} from '@/services/nerdle'

const route = useRoute()
const router = useRouter()

const KEYPAD_TOP = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']
const KEYPAD_OPS = ['+', '-', '*', '/', '=']

const code = ref('')
const answer = ref('')
const guesses = ref<{ text: string; statuses: TileStatus[] }[]>([])
const current = ref('')
const gameState = ref<'playing' | 'won' | 'lost'>('playing')
const keyStatuses = ref<Record<string, TileStatus>>({})
const shaking = ref(false)
const message = ref('')
const snackbar = ref(false)

const displayChar = (ch: string): string => (ch === '*' ? '×' : ch === '/' ? '÷' : ch)

const rows = computed(() => {
  const out: { char: string; status: TileStatus | 'empty' | 'typing' }[][] = []
  for (let r = 0; r < MAX_GUESSES; r += 1) {
    if (r < guesses.value.length) {
      const g = guesses.value[r]
      out.push(g.text.split('').map((ch, i) => ({ char: displayChar(ch), status: g.statuses[i] })))
    } else if (r === guesses.value.length && gameState.value === 'playing') {
      const cells = []
      for (let i = 0; i < WIDTH; i += 1) {
        cells.push({ char: i < current.value.length ? displayChar(current.value[i]) : '', status: 'typing' as const })
      }
      out.push(cells)
    } else {
      out.push(Array.from({ length: WIDTH }, () => ({ char: '', status: 'empty' as const })))
    }
  }
  return out
})

const flash = (msg: string) => {
  message.value = msg
  snackbar.value = true
  shaking.value = true
  setTimeout(() => (shaking.value = false), 420)
}

const build = () => {
  answer.value = generateEquation(code.value)
  guesses.value = []
  current.value = ''
  gameState.value = 'playing'
  keyStatuses.value = {}
}

const syncUrl = () => router.replace({ name: 'nerdle', params: { seed: code.value } })
const newGame = () => {
  code.value = randomSeed()
  syncUrl()
  build()
}

const pressKey = (k: string) => {
  if (gameState.value !== 'playing') return
  if (current.value.length < WIDTH) current.value += k
}
const del = () => {
  if (gameState.value !== 'playing') return
  current.value = current.value.slice(0, -1)
}

const submit = () => {
  if (gameState.value !== 'playing') return
  if (current.value.length !== WIDTH) {
    flash(`The equation is ${WIDTH} tiles`)
    return
  }
  if (!current.value.includes('=')) {
    flash('Needs an = sign')
    return
  }
  if (!isValidEquation(current.value)) {
    flash("That's not a valid equation")
    return
  }
  const statuses = scoreGuess(current.value, answer.value)
  guesses.value = [...guesses.value, { text: current.value, statuses }]
  keyStatuses.value = mergeKeyStatuses(keyStatuses.value, current.value, statuses)
  if (current.value === answer.value) {
    gameState.value = 'won'
  } else if (guesses.value.length >= MAX_GUESSES) {
    gameState.value = 'lost'
  }
  current.value = ''
}

const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    submit()
  } else if (e.key === 'Backspace') {
    e.preventDefault()
    del()
  } else if (/^[0-9+\-*/=]$/.test(e.key)) {
    e.preventDefault()
    pressKey(e.key)
  }
}

const keyClass = (k: string) => {
  const s = keyStatuses.value[k]
  return s ? `key--${s}` : ''
}

const shareText = computed(() => {
  const emoji: Record<TileStatus, string> = { correct: '🟩', present: '🟪', absent: '⬛' }
  const grid = guesses.value.map((g) => g.statuses.map((s) => emoji[s]).join('')).join('\n')
  const score = gameState.value === 'won' ? `${guesses.value.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`
  return `Nerdle ${score}\n${grid}`
})

const share = async () => {
  const url = window.location.origin + route.fullPath
  await copyToClipboard(`${shareText.value}\n${url}`)
  message.value = 'Result copied — share it!'
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
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <v-container class="py-6" max-width="520">
    <GameToolbar title="Nerdle" shareable @share="share">
      <template #intro>
        Guess the hidden equation in six tries. Every guess must be a true, well-formed equation.
        Tiles turn <span class="chip chip--correct">green</span> (right spot),
        <span class="chip chip--present">purple</span> (wrong spot), or dark (not used).
      </template>
      <template #settings>
        <v-btn variant="tonal" color="primary" prepend-icon="mdi-refresh" @click="newGame">New game</v-btn>
      </template>
      <template #info>
        <h3>Goal</h3>
        <p>Find the secret equation — digits <span class="k">0–9</span> and <span class="k">+ − × ÷ =</span> across {{ WIDTH }} tiles.</p>
        <h3>Rules</h3>
        <ul>
          <li>Each guess must be arithmetically true (e.g. <span class="k">48-36=12</span>).</li>
          <li>Standard order of operations applies: × and ÷ before + and −.</li>
          <li>The value right of <span class="k">=</span> is a plain number, and numbers don't start with 0.</li>
          <li>Green = correct tile; purple = right symbol, wrong spot; dark = not in the equation.</li>
        </ul>
      </template>
    </GameToolbar>

    <div class="d-flex align-center mb-3">
      <v-spacer />
      <v-btn variant="tonal" color="primary" prepend-icon="mdi-refresh" @click="newGame">New</v-btn>
    </div>

    <!-- Grid -->
    <div class="grid" :class="{ shake: shaking }">
      <div v-for="(row, r) in rows" :key="r" class="grid-row">
        <div v-for="(tile, c) in row" :key="c" class="tile" :class="`tile--${tile.status}`">
          {{ tile.char }}
        </div>
      </div>
    </div>

    <!-- Result -->
    <div v-if="gameState !== 'playing'" class="text-center my-3">
      <p v-if="gameState === 'won'" class="text-h6 mb-1">Solved in {{ guesses.length }} 🎉</p>
      <p v-else class="text-h6 mb-1">Out of guesses — it was <strong>{{ answer }}</strong></p>
      <v-btn color="primary" variant="flat" prepend-icon="mdi-refresh" class="mt-1" @click="newGame">New game</v-btn>
    </div>

    <!-- Keypad -->
    <div class="keypad mt-4">
      <div class="keypad-row">
        <v-btn v-for="k in KEYPAD_TOP" :key="k" class="key" :class="keyClass(k)" variant="tonal" @click="pressKey(k)">{{ k }}</v-btn>
      </div>
      <div class="keypad-row">
        <v-btn v-for="k in KEYPAD_OPS" :key="k" class="key" :class="keyClass(k)" variant="tonal" @click="pressKey(k)">{{ displayChar(k) }}</v-btn>
        <v-btn class="key key--wide" variant="tonal" icon="mdi-backspace-outline" @click="del" />
        <v-btn class="key key--wide" color="primary" variant="flat" @click="submit">Enter</v-btn>
      </div>
    </div>

    <v-snackbar v-model="snackbar" :timeout="2200" color="secondary">{{ message }}</v-snackbar>
  </v-container>
</template>

<style scoped>
.grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
}
.grid-row {
  display: flex;
  gap: 6px;
}
.tile {
  width: clamp(30px, 10vw, 46px);
  height: clamp(30px, 10vw, 46px);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(1rem, 5vw, 1.5rem);
  font-weight: 700;
  border-radius: 6px;
  color: #e2e8f0;
  border: 2px solid rgba(148, 163, 184, 0.3);
  background: rgba(30, 41, 59, 0.5);
}
.tile--typing {
  border-color: rgba(148, 163, 184, 0.6);
}
.tile--empty {
  background: rgba(30, 41, 59, 0.25);
}
.tile--correct { background: #22c55e; border-color: #22c55e; color: #04210f; }
.tile--present { background: #a855f7; border-color: #a855f7; color: #1a0533; }
.tile--absent { background: rgba(30, 41, 59, 0.85); border-color: rgba(71, 85, 105, 0.8); }

.keypad {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
}
.keypad-row {
  display: flex;
  gap: 6px;
  justify-content: center;
  flex-wrap: wrap;
}
.key {
  min-width: 40px !important;
  font-size: 1.15rem;
  font-weight: 700;
}
.key--wide {
  min-width: 64px !important;
}
.key--correct { background: #22c55e !important; color: #04210f !important; }
.key--present { background: #a855f7 !important; color: #fff !important; }
.key--absent { opacity: 0.4; }

.chip {
  padding: 0 6px;
  border-radius: 4px;
  font-weight: 700;
}
.chip--correct { background: #22c55e; color: #04210f; }
.chip--present { background: #a855f7; color: #fff; }

.shake {
  animation: shake 0.4s ease;
}
@keyframes shake {
  10%, 90% { transform: translateX(-2px); }
  20%, 80% { transform: translateX(4px); }
  30%, 50%, 70% { transform: translateX(-6px); }
  40%, 60% { transform: translateX(6px); }
}
</style>
