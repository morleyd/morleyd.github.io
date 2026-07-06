<script setup lang="ts">
/**
 * Wordle Helper — a standalone constraint solver.
 * Model matches Wordle's real rules:
 *  - each of the 5 positions can have one CORRECT (green) letter
 *  - each position can have MANY "wrong spot" (yellow) letters — in the word, but not here
 *  - a separate list of letters that are NOT in the word (gray)
 */
import { computed, ref } from 'vue'
import { answerBank } from '@/services/wordLists'
import { WORD_LENGTH, evaluateGuess, statusesToPattern } from '@/services/wordleLogic'

const greens = ref<string[]>(Array.from({ length: WORD_LENGTH }, () => ''))
const yellows = ref<string[][]>(Array.from({ length: WORD_LENGTH }, () => []))
const excluded = ref<string[]>([])
// Minimum number of times a letter must appear (for duplicates, e.g. two E's)
const letterCounts = ref<Record<string, number>>({})
const newCountLetter = ref('')

/** Normalize combobox entries into a deduped list of single uppercase letters. */
const sanitizeLetters = (list: unknown[]): string[] => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of list) {
    for (const ch of String(raw).toUpperCase().replace(/[^A-Z]/g, '')) {
      if (!seen.has(ch)) {
        seen.add(ch)
        out.push(ch)
      }
    }
  }
  return out
}

const setGreen = (index: number, event: Event) => {
  const value = (event.target as HTMLInputElement).value.toUpperCase().replace(/[^A-Z]/g, '')
  greens.value[index] = value.slice(-1)
}

const setYellow = (index: number, value: unknown[]) => {
  yellows.value[index] = sanitizeLetters(value)
}

const setExcluded = (value: unknown[]) => {
  excluded.value = sanitizeLetters(value)
}

const addLetterCount = () => {
  const letter = newCountLetter.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 1)
  newCountLetter.value = ''
  if (letter && !(letter in letterCounts.value)) {
    letterCounts.value[letter] = 2
  }
}
const bumpCount = (letter: string, delta: number) => {
  const next = (letterCounts.value[letter] ?? 2) + delta
  if (next < 1) {
    removeCount(letter)
  } else {
    letterCounts.value[letter] = Math.min(next, WORD_LENGTH)
  }
}
const removeCount = (letter: string) => {
  delete letterCounts.value[letter]
}

const hasInput = computed(
  () =>
    greens.value.some(Boolean) ||
    yellows.value.some((list) => list.length > 0) ||
    excluded.value.length > 0 ||
    Object.keys(letterCounts.value).length > 0,
)

/** Letters known to be in the word (green, yellow, or a required count) — exempt from the gray filter. */
const knownPresent = computed(() => {
  const set = new Set<string>()
  greens.value.forEach((letter) => letter && set.add(letter))
  yellows.value.forEach((list) => list.forEach((letter) => set.add(letter)))
  Object.keys(letterCounts.value).forEach((letter) => set.add(letter))
  return set
})

const countOccurrences = (word: string, letter: string): number => {
  let count = 0
  for (const ch of word) {
    if (ch === letter) count += 1
  }
  return count
}

const matches = (word: string): boolean => {
  for (let i = 0; i < WORD_LENGTH; i += 1) {
    if (greens.value[i] && word[i] !== greens.value[i]) {
      return false
    }
    for (const letter of yellows.value[i]) {
      if (!word.includes(letter) || word[i] === letter) {
        return false
      }
    }
  }
  for (const letter of excluded.value) {
    if (!knownPresent.value.has(letter) && word.includes(letter)) {
      return false
    }
  }
  for (const [letter, min] of Object.entries(letterCounts.value)) {
    if (countOccurrences(word, letter) < min) {
      return false
    }
  }
  return true
}

const candidates = computed(() => answerBank.filter(matches))

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

const showSuggestions = ref(false)

const reset = () => {
  greens.value = Array.from({ length: WORD_LENGTH }, () => '')
  yellows.value = Array.from({ length: WORD_LENGTH }, () => [])
  excluded.value = []
  letterCounts.value = {}
  newCountLetter.value = ''
}
</script>

<template>
  <v-main class="helper-main">
    <v-card class="pa-5 pa-sm-6 helper-card" max-width="640" elevation="8">
      <div class="text-center mb-4">
        <h1 class="page-title mb-1">Wordle Helper</h1>
        <p class="text-body-2 text-grey-lighten-1">
          Fill in what you know and the list of possible answers narrows as you go.
        </p>
      </div>

      <p class="text-subtitle-2 mb-1">For each spot: the correct letter, plus any letters that belong in the word but <em>not</em> here.</p>

      <div class="pos-list mb-4">
        <div v-for="i in WORD_LENGTH" :key="`pos-${i}`" class="pos-row">
          <div class="pos-index">{{ i }}</div>
          <input
            class="green-tile"
            :class="{ 'green-tile--filled': greens[i - 1] }"
            :value="greens[i - 1]"
            maxlength="1"
            inputmode="text"
            aria-label="Correct letter for this spot"
            @input="setGreen(i - 1, $event)"
          />
          <v-combobox
            :model-value="yellows[i - 1]"
            @update:model-value="setYellow(i - 1, $event)"
            multiple
            chips
            closable-chips
            hide-details
            density="compact"
            variant="outlined"
            label="Wrong-spot letters"
            class="yellow-field"
          />
        </div>
      </div>

      <v-combobox
        :model-value="excluded"
        @update:model-value="setExcluded($event)"
        multiple
        chips
        closable-chips
        hide-details
        density="compact"
        variant="outlined"
        label="Letters not in the word"
        prepend-inner-icon="mdi-close-circle-outline"
        class="mb-3"
      />

      <!-- Letter counts: for letters that appear more than once -->
      <div class="mb-2">
        <p class="text-caption text-grey-lighten-1 mb-1">
          Letter counts <span class="text-medium-emphasis">— use when a letter appears more than once</span>
        </p>
        <div class="d-flex align-center flex-wrap ga-2">
          <div v-for="(min, letter) in letterCounts" :key="letter" class="count-pill">
            <span class="count-letter">{{ letter }}</span>
            <span class="count-times">×</span>
            <v-btn icon="mdi-minus" size="x-small" variant="text" density="comfortable" @click="bumpCount(letter, -1)" />
            <span class="count-value">{{ min }}</span>
            <v-btn icon="mdi-plus" size="x-small" variant="text" density="comfortable" @click="bumpCount(letter, 1)" />
            <v-btn icon="mdi-close" size="x-small" variant="text" density="comfortable" @click="removeCount(letter)" />
          </div>
          <v-text-field
            v-model="newCountLetter"
            label="Add letter"
            maxlength="1"
            hide-details
            density="compact"
            variant="outlined"
            style="max-width: 130px"
            append-inner-icon="mdi-plus"
            @keyup.enter="addLetterCount"
            @click:append-inner="addLetterCount"
          />
        </div>
      </div>

      <div class="d-flex justify-end mb-2">
        <v-btn variant="text" size="small" prepend-icon="mdi-refresh" :disabled="!hasInput" @click="reset">
          Reset
        </v-btn>
      </div>

      <v-divider class="mb-4" />

      <div v-if="!hasInput" class="text-center text-grey-lighten-1 text-body-2">
        Enter what you know above to see matching words.
      </div>

      <template v-else>
        <div v-if="suggestions.length" class="mb-4">
          <v-btn
            variant="text"
            size="small"
            class="px-1"
            :prepend-icon="showSuggestions ? 'mdi-chevron-up' : 'mdi-chevron-down'"
            @click="showSuggestions = !showSuggestions"
          >
            {{ showSuggestions ? 'Hide' : 'Show' }} suggested guesses
          </v-btn>
          <div v-if="showSuggestions" class="d-flex flex-wrap ga-2 mt-2">
            <v-chip v-for="s in suggestions" :key="s.word" color="primary" variant="flat">
              {{ s.word }}
              <span class="text-caption ml-1 text-medium-emphasis">{{ s.info.toFixed(1) }} bits</span>
            </v-chip>
          </div>
        </div>

        <p class="text-subtitle-2 mb-2">
          {{ candidates.length }} possible {{ candidates.length === 1 ? 'word' : 'words' }}
        </p>
        <div v-if="candidates.length === 0" class="text-error text-body-2">
          No words match — double-check your letters.
        </div>
        <v-virtual-scroll v-else :items="candidates" height="260" class="helper-results">
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
  min-height: 100%;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 16px 12px 32px;
}

.helper-card {
  width: 100%;
}

.pos-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pos-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.pos-index {
  flex: 0 0 auto;
  width: 18px;
  text-align: center;
  color: #94a3b8;
  font-weight: 600;
}

.green-tile {
  flex: 0 0 auto;
  width: 48px;
  height: 48px;
  text-align: center;
  text-transform: uppercase;
  font-size: 1.4rem;
  font-weight: 700;
  color: #e2e8f0;
  background: rgba(15, 23, 42, 0.6);
  border: 2px solid rgba(148, 163, 184, 0.35);
  border-radius: 8px;
  outline: none;
  caret-color: #22c55e;
}
.green-tile:focus {
  border-color: #22c55e;
}
.green-tile--filled {
  background: #22c55e;
  border-color: #22c55e;
  color: #032311;
}

.yellow-field {
  flex: 1 1 auto;
}

.count-pill {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px 4px 2px 10px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.6);
}

.count-letter {
  font-weight: 700;
  text-transform: uppercase;
}

.count-times {
  opacity: 0.6;
  margin: 0 1px;
}

.count-value {
  min-width: 12px;
  text-align: center;
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
</style>
