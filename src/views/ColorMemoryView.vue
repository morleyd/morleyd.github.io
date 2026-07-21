<script setup lang="ts">
/**
 * Color from Memory — a target color flashes for a few seconds, then you
 * recreate it from memory with R/G/B sliders. Scored by perceptual (redmean)
 * distance. Logic lives in services/colorMemory.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import GameToolbar from '@/components/GameToolbar.vue'
import { randomColor, rating, scorePercent, toCss, type RGB } from '@/services/colorMemory'

const PEEK_SECONDS = 3
const BEST_KEY = 'colormemory-best'

const phase = ref<'peek' | 'guess' | 'result'>('peek')
const target = ref<RGB>({ r: 128, g: 128, b: 128 })
const guess = ref<RGB>({ r: 128, g: 128, b: 128 })
const countdown = ref(PEEK_SECONDS)
const round = ref(0)
const total = ref(0)
const lastScore = ref(0)
const best = ref(0)

let peekTimer: ReturnType<typeof setInterval> | null = null

const guessCss = computed(() => toCss(guess.value))
const targetCss = computed(() => toCss(target.value))
const average = computed(() => (round.value > 0 ? Math.round(total.value / round.value) : 0))

const stopPeek = () => {
  if (peekTimer) clearInterval(peekTimer)
  peekTimer = null
}

const startRound = () => {
  stopPeek()
  target.value = randomColor(Math.random)
  guess.value = { r: 128, g: 128, b: 128 }
  phase.value = 'peek'
  countdown.value = PEEK_SECONDS
  peekTimer = setInterval(() => {
    countdown.value -= 1
    if (countdown.value <= 0) {
      stopPeek()
      phase.value = 'guess'
    }
  }, 1000)
}

const submit = () => {
  if (phase.value !== 'guess') return
  lastScore.value = scorePercent(target.value, guess.value)
  total.value += lastScore.value
  round.value += 1
  if (lastScore.value > best.value) {
    best.value = lastScore.value
    try {
      localStorage.setItem(BEST_KEY, String(best.value))
    } catch {
      // ignore
    }
  }
  phase.value = 'result'
}

const channels = [
  { key: 'r', label: 'R', color: '#ef4444' },
  { key: 'g', label: 'G', color: '#22c55e' },
  { key: 'b', label: 'B', color: '#3b82f6' },
] as const

const setChannel = (key: 'r' | 'g' | 'b', v: number) => {
  guess.value = { ...guess.value, [key]: Math.round(v) }
}

onMounted(() => {
  try {
    best.value = Number(localStorage.getItem(BEST_KEY)) || 0
  } catch {
    best.value = 0
  }
  startRound()
})
onBeforeUnmount(stopPeek)
</script>

<template>
  <v-container class="py-6" max-width="520">
    <GameToolbar title="Color from Memory">
      <template #intro>
        A color appears for {{ PEEK_SECONDS }} seconds — study it, then recreate it from memory with
        the sliders. The closer you get, the higher your score.
      </template>
      <template #info>
        <h3>Goal</h3>
        <p>Memorize the target color, then mix it back using the red, green, and blue sliders.</p>
        <h3>Scoring</h3>
        <p>Your score (0–100) is based on how close your color looks to the target, using a perceptual color-distance formula — so being a little off in a sensitive channel costs more.</p>
        <h3>Tips</h3>
        <ul>
          <li>Note the hue first (is it warm or cool?), then how light and how vivid it is.</li>
          <li>Only near-perfect mixes score in the 90s — the scale is deliberately strict.</li>
        </ul>
      </template>
    </GameToolbar>

    <!-- Stats -->
    <div class="d-flex align-center ga-3 mb-4">
      <div class="text-body-2 text-medium-emphasis">Round {{ round + (phase === 'result' ? 0 : 1) }}</div>
      <v-spacer />
      <div class="text-body-2 text-medium-emphasis">Avg: {{ average }}</div>
      <div class="text-body-2 text-medium-emphasis">Best: {{ best }}</div>
    </div>

    <!-- Peek -->
    <template v-if="phase === 'peek'">
      <div class="swatch swatch--big" :style="{ background: targetCss }">
        <span class="peek-count">{{ countdown }}</span>
      </div>
      <p class="text-center text-medium-emphasis mt-3">Memorize this color…</p>
    </template>

    <!-- Guess -->
    <template v-else-if="phase === 'guess'">
      <div class="swatch swatch--big" :style="{ background: guessCss }" />
      <div class="mt-4">
        <div v-for="ch in channels" :key="ch.key" class="channel">
          <span class="channel-label" :style="{ color: ch.color }">{{ ch.label }}</span>
          <v-slider
            :model-value="guess[ch.key]"
            :min="0"
            :max="255"
            :step="1"
            hide-details
            density="compact"
            :color="ch.color"
            :track-color="ch.color"
            @update:model-value="(v: number) => setChannel(ch.key, v)"
          />
          <span class="channel-value">{{ guess[ch.key] }}</span>
        </div>
      </div>
      <v-btn block color="primary" variant="flat" size="large" class="mt-3" @click="submit">Lock it in</v-btn>
    </template>

    <!-- Result -->
    <template v-else>
      <div class="compare">
        <div class="compare-col">
          <div class="swatch" :style="{ background: targetCss }" />
          <span class="text-caption text-medium-emphasis mt-1">Target</span>
        </div>
        <div class="compare-col">
          <div class="swatch" :style="{ background: guessCss }" />
          <span class="text-caption text-medium-emphasis mt-1">Yours</span>
        </div>
      </div>
      <div class="text-center mt-4">
        <p class="text-h3 mb-0">{{ lastScore }}</p>
        <p class="text-h6 mb-1">{{ rating(lastScore) }}<span v-if="lastScore === best && best > 0"> · new best!</span></p>
        <p class="text-caption text-medium-emphasis mb-3">
          Target {{ targetCss }} · Yours {{ guessCss }}
        </p>
        <v-btn color="primary" variant="flat" prepend-icon="mdi-arrow-right" @click="startRound">Next color</v-btn>
      </div>
    </template>
  </v-container>
</template>

<style scoped>
.swatch {
  width: 100%;
  height: 160px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  box-shadow: inset 0 0 30px rgba(0, 0, 0, 0.15);
}
.swatch--big {
  height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.peek-count {
  font-size: 4rem;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.85);
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
}

.channel {
  display: flex;
  align-items: center;
  gap: 12px;
}
.channel-label {
  width: 18px;
  font-weight: 800;
  font-size: 1.1rem;
}
.channel-value {
  width: 34px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: rgba(148, 163, 184, 0.9);
}

.compare {
  display: flex;
  gap: 12px;
}
.compare-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.compare-col .swatch {
  height: 140px;
}
</style>
