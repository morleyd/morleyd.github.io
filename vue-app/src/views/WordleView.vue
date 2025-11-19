<script setup lang="ts">
/**
 * Wordle Game View
 * Main component for the Wordle game with support for:
 * - Daily puzzles and custom word sharing
 * - Hard mode with constraint validation
 * - Gameplay analysis
 * - Keyboard and physical keyboard input
 */

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { analyzeGame } from '@/services/analyzer'
import { MAX_ATTEMPTS, WORD_LENGTH, evaluateGuess, statusPriority } from '@/services/wordleLogic'
import {
  allowedWordSet,
  getDailyAnswer,
  getFormattedPuzzleDate,
  getRandomWord,
} from '@/services/wordLists'
import { decodeCustomWord, encodeCustomWord, normalizeWordInput } from '@/services/customWord'
import {
  computeHardModeConstraints,
  validateHardModeGuess,
} from '@/services/hardMode'
import {
  getCustomPuzzleId,
  getDailyPuzzleId,
  getRandomPuzzleId,
  loadGameState,
  saveGameState,
} from '@/services/storage'
import { copyToClipboard, generateShareText } from '@/services/share'
import type { LetterStatus } from '@/services/wordleLogic'

// ============================================================================
// Types & Interfaces
// ============================================================================

type GameState = 'playing' | 'won' | 'lost'
type SnackbarColor = 'info' | 'success' | 'warning' | 'error'

interface GuessResult {
  guess: string
  statuses: LetterStatus[]
}

interface BoardRow {
  letters: string[]
  statuses: LetterStatus[]
}

// ============================================================================
// Router & Constants
// ============================================================================

const route = useRoute()
const router = useRouter()

/** QWERTY keyboard layout for on-screen keyboard */
const keyboardRows = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'BACK'],
] as const

// ============================================================================
// Reactive State
// ============================================================================

const allowedWords = allowedWordSet
const dailyAnswerInfo = ref(getDailyAnswer())
const targetWord = ref<string>(dailyAnswerInfo.value.word)
const guesses = ref<GuessResult[]>([])
const currentGuess = ref('')
const gameState = ref<GameState>('playing')
const letterStatuses = ref<Record<string, LetterStatus>>({})
const hardMode = ref(false)

// UI State
const snackbar = ref({
  show: false,
  message: '',
  color: 'info' as SnackbarColor,
})
const analysisDialog = ref(false)
const shareMenu = ref(false)
const helpMenu = ref(false)

// Puzzle Type Tracking
type PuzzleType = 'daily' | 'custom' | 'random'
const puzzleType = ref<PuzzleType>('daily')

// Custom Word Sharing State
const activeHash = ref<string | null>(null)
const activeCustomWord = ref<string | null>(null)
const customWordInput = ref('')
const customWordError = ref('')
const customShareLink = ref('')
const shareCopied = ref(false)

// Random Word State
const randomWord = ref<string | null>(null)

// ============================================================================
// Computed Properties
// ============================================================================

const puzzleNumber = computed(() => dailyAnswerInfo.value.dayOffset + 1)
const puzzleDateLabel = computed(() => getFormattedPuzzleDate(dailyAnswerInfo.value.date))
const gameFinished = computed(() => gameState.value !== 'playing')
const isCustomWordActive = computed(() => puzzleType.value === 'custom')
const isRandomWordActive = computed(() => puzzleType.value === 'random')
const activeWordLabel = computed(() => {
  if (puzzleType.value === 'custom') return 'Custom puzzle'
  if (puzzleType.value === 'random') return 'Random puzzle'
  return 'Daily puzzle'
})
const canShareScore = computed(() => gameFinished.value && guesses.value.length > 0)

const analysisData = computed(() =>
  analyzeGame(
    guesses.value.map((entry) => ({
      guess: entry.guess,
      statuses: entry.statuses,
    })),
  ),
)

/**
 * Builds the game board rows from guesses and current input
 * Includes empty rows to fill up to MAX_ATTEMPTS
 */
const boardRows = computed<BoardRow[]>(() => {
  const rows: BoardRow[] = guesses.value.map((entry) => ({
    letters: entry.guess.split(''),
    statuses: entry.statuses,
  }))

  // Add current guess row if game is still active
  if (gameState.value === 'playing' && rows.length < MAX_ATTEMPTS) {
    rows.push({
      letters: Array.from({ length: WORD_LENGTH }, (_, index) => currentGuess.value.charAt(index)),
      statuses: Array.from({ length: WORD_LENGTH }, () => 'empty' as LetterStatus),
    })
  }

  // Fill remaining rows with empty tiles
  while (rows.length < MAX_ATTEMPTS) {
    rows.push({
      letters: Array.from({ length: WORD_LENGTH }, () => ''),
      statuses: Array.from({ length: WORD_LENGTH }, () => 'empty' as LetterStatus),
    })
  }

  return rows
})

// ============================================================================
// Word Management Functions
// ============================================================================

/**
 * Resets the game board for a new word
 */
function resetBoardForWord(word: string) {
  targetWord.value = word
  guesses.value = []
  currentGuess.value = ''
  letterStatuses.value = {}
  gameState.value = 'playing'
  saveCurrentGameState()
}

/**
 * Applies the daily word puzzle
 */
function applyDailyWord(resetBoard = true) {
  const info = getDailyAnswer()
  dailyAnswerInfo.value = info
  activeHash.value = null
  activeCustomWord.value = null
  randomWord.value = null
  puzzleType.value = 'daily'

  if (resetBoard) {
    const puzzleId = getDailyPuzzleId()
    const cached = loadGameState(puzzleId)

    if (cached) {
      // Restore from cache
      targetWord.value = cached.targetWord
      guesses.value = cached.guesses
      currentGuess.value = cached.currentGuess
      gameState.value = cached.gameState
      letterStatuses.value = cached.letterStatuses
      hardMode.value = cached.hardMode
      showSnackbar('Game restored from previous session.', 'info')
    } else {
      resetBoardForWord(info.word)
    }
  } else {
    targetWord.value = info.word
  }

  saveCurrentGameState()
}

/**
 * Applies a custom word from a hash
 * @returns true if hash was valid and applied, false otherwise
 */
function applyCustomHash(hash: string, { resetBoard = true }: { resetBoard?: boolean } = {}) {
  const decoded = decodeCustomWord(hash)
  if (!decoded) {
    return false
  }

  activeHash.value = hash
  activeCustomWord.value = decoded
  randomWord.value = null
  puzzleType.value = 'custom'

  if (resetBoard) {
    const puzzleId = getCustomPuzzleId(hash)
    const cached = loadGameState(puzzleId)

    if (cached) {
      // Restore from cache
      targetWord.value = cached.targetWord
      guesses.value = cached.guesses
      currentGuess.value = cached.currentGuess
      gameState.value = cached.gameState
      letterStatuses.value = cached.letterStatuses
      hardMode.value = cached.hardMode
      showSnackbar('Game restored from previous session.', 'info')
    } else {
      resetBoardForWord(decoded)
    }
  } else {
    targetWord.value = decoded
  }

  saveCurrentGameState()
  return true
}

/**
 * Starts a random word puzzle
 */
function startRandomWord() {
  shareMenu.value = false
  helpMenu.value = false
  const word = getRandomWord()
  randomWord.value = word
  activeHash.value = null
  activeCustomWord.value = null
  puzzleType.value = 'random'

  const puzzleId = getRandomPuzzleId(word)
  const cached = loadGameState(puzzleId)

  if (cached) {
    // Restore from cache
    targetWord.value = cached.targetWord
    guesses.value = cached.guesses
    currentGuess.value = cached.currentGuess
    gameState.value = cached.gameState
    letterStatuses.value = cached.letterStatuses
    hardMode.value = cached.hardMode
    showSnackbar('Game restored from previous session.', 'info')
  } else {
    resetBoardForWord(word)
  }

  saveCurrentGameState()
}

/**
 * Synchronizes the active word from route parameters
 * Handles both hash params and query params for backward compatibility
 */
function syncWordFromRoute(resetBoard = true) {
  const paramHash = typeof route.params.hash === 'string' ? route.params.hash : undefined
  const queryHash = typeof route.query.word === 'string' ? route.query.word : undefined
  const encoded = paramHash ?? queryHash ?? null

  if (encoded) {
    // Skip if same hash and not resetting
    if (encoded === activeHash.value && !resetBoard) {
      return
    }

    if (applyCustomHash(encoded, { resetBoard })) {
      return
    }

    // Invalid hash - fall back to daily word
    showSnackbar('Invalid shared puzzle. Loading daily word.', 'warning')
    router.replace({ name: 'wordle' }).catch(() => { })
    applyDailyWord(resetBoard)
    return
  }

  // No hash in route - use daily word
  if (activeHash.value !== null || resetBoard) {
    applyDailyWord(resetBoard)
  }
}

// ============================================================================
// Game Logic Functions
// ============================================================================

/**
 * Handles keyboard input (both on-screen and physical)
 */
function handleKeyInput(key: string) {
  if(shareMenu.value) {
    return
  }

  if (gameState.value !== 'playing') {
    showSnackbar('Game over. Reset to play again.', 'warning')
    return
  }

  if (key === 'ENTER') {
    submitGuess()
    return
  }

  if (key === 'BACK') {
    currentGuess.value = currentGuess.value.slice(0, -1)
    return
  }

  // Add letter if valid and space available
  if (/^[A-Z]$/.test(key) && currentGuess.value.length < WORD_LENGTH) {
    currentGuess.value += key
  }
}

/**
 * Validates and submits the current guess
 * Checks word validity, hard mode constraints, and updates game state
 */
function submitGuess() {
  // Validate length
  if (currentGuess.value.length < WORD_LENGTH) {
    showSnackbar('Need 5 letters before submitting.', 'warning')
    return
  }

  // Validate word is in allowed list (or is the target word for custom puzzles)
  if (!allowedWords.has(currentGuess.value) && currentGuess.value !== targetWord.value) {
    showSnackbar('Not in the official list.', 'error')
    return
  }

  // Validate hard mode constraints
  if (hardMode.value && guesses.value.length > 0) {
    const constraints = computeHardModeConstraints(guesses.value)
    const validation = validateHardModeGuess(currentGuess.value, constraints)
    if (!validation.valid) {
      showSnackbar(validation.error ?? 'Invalid guess for hard mode.', 'error')
      return
    }
  }

  // Evaluate guess and update state
  const statuses = evaluateGuess(currentGuess.value, targetWord.value)
  guesses.value.push({ guess: currentGuess.value, statuses })
  updateLetterStatuses(currentGuess.value, statuses)

  // Check win/loss conditions
  if (currentGuess.value === targetWord.value) {
    gameState.value = 'won'
    showSnackbar('You found it! 🎉', 'success')
  } else if (guesses.value.length >= MAX_ATTEMPTS) {
    gameState.value = 'lost'
    showSnackbar(`So close! The word was ${targetWord.value}.`, 'info')
  }

  currentGuess.value = ''
  saveCurrentGameState()
}

/**
 * Updates keyboard letter statuses based on guess results
 * Uses priority system: correct > present > absent > empty
 */
function updateLetterStatuses(guess: string, statuses: LetterStatus[]) {
  statuses.forEach((status, index) => {
    const letter = guess.charAt(index)
    const existing = letterStatuses.value[letter] ?? 'empty'
    if (statusPriority[status] > statusPriority[existing]) {
      letterStatuses.value[letter] = status
    }
  })
}

/**
 * Returns CSS class for keyboard key based on letter status
 */
function keyboardClass(key: string) {
  if (key === 'ENTER' || key === 'BACK') {
    return 'keyboard-key--action'
  }

  const status = letterStatuses.value[key] ?? 'empty'
  if (!status || status === 'empty') {
    return 'keyboard-key--empty'
  }

  return `keyboard-key--${status}`
}

// ============================================================================
// Custom Word Sharing Functions
// ============================================================================

/**
 * Builds a shareable URL for a custom word hash
 */
function buildShareUrl(hash: string) {
  const resolved = router.resolve({ name: 'wordle', params: { hash } })
  if (typeof window !== 'undefined') {
    return new URL(resolved.href, window.location.origin).toString()
  }
  return resolved.href
}

/**
 * Creates and loads a custom puzzle from user input
 */
function createCustomPuzzle() {
  customWordError.value = ''
  customShareLink.value = ''
  shareCopied.value = false

  if (customWordInput.value.length !== WORD_LENGTH) {
    customWordError.value = 'Enter exactly 5 letters'
    return
  }

  try {
    const hash = encodeCustomWord(customWordInput.value)
    customShareLink.value = buildShareUrl(hash)
    router.push({ name: 'wordle', params: { hash } }).catch(() => { })
    showSnackbar('Custom puzzle loaded! Share the link below.', 'success')
  } catch (error) {
    customWordError.value = (error as Error).message
  }
}

/**
 * Copies the share link to clipboard
 */
async function copyShareLink() {
  if (!customShareLink.value || typeof navigator === 'undefined' || !navigator.clipboard) {
    return
  }

  try {
    await navigator.clipboard.writeText(customShareLink.value)
    shareCopied.value = true
    showSnackbar('Link copied to clipboard.', 'success')
  } catch {
    showSnackbar('Unable to copy link automatically.', 'warning')
  }
}

/**
 * Returns to the daily puzzle from custom/random mode
 */
function returnToDailyPuzzle() {
  shareMenu.value = false
  helpMenu.value = false
  router.push({ name: 'wordle' }).catch(() => { })
  applyDailyWord(true)
}

/**
 * Gets the current puzzle ID for storage
 */
function getCurrentPuzzleId(): string {
  if (puzzleType.value === 'custom' && activeHash.value) {
    return getCustomPuzzleId(activeHash.value)
  }
  if (puzzleType.value === 'random' && randomWord.value) {
    return getRandomPuzzleId(randomWord.value)
  }
  return getDailyPuzzleId()
}

/**
 * Saves current game state to localStorage
 */
function saveCurrentGameState() {
  const puzzleId = getCurrentPuzzleId()
  saveGameState({
    targetWord: targetWord.value,
    guesses: guesses.value,
    currentGuess: currentGuess.value,
    gameState: gameState.value,
    letterStatuses: letterStatuses.value,
    hardMode: hardMode.value,
    puzzleId,
    puzzleType: puzzleType.value,
    timestamp: Date.now(),
  })
}

/**
 * Shares the completed game score in Wordle format
 */
async function shareScore() {
  if (!canShareScore.value) {
    return
  }

  let shareLink = ''
  if (puzzleType.value === 'custom' && activeHash.value) {
    // Use existing hash for custom words
    shareLink = buildShareUrl(activeHash.value)
  } else if (puzzleType.value === 'random' && randomWord.value) {
    // For random words, encode the word so others can play the same puzzle
    try {
      const hash = encodeCustomWord(randomWord.value)
      shareLink = buildShareUrl(hash)
    } catch {
      // Fallback to just the score without link
    }
  } else if (puzzleType.value === 'daily') {
    // For daily puzzles, encode the word so others can play the same puzzle
    try {
      const hash = encodeCustomWord(targetWord.value)
      shareLink = buildShareUrl(hash)
    } catch {
      // Fallback to just the score without link
    }
  }

  const shareText = generateShareText(
    guesses.value,
    puzzleType.value,
    puzzleType.value === 'daily' ? puzzleNumber.value : undefined,
    shareLink,
  )

  const success = await copyToClipboard(shareText)
  if (success) {
    showSnackbar('Score copied to clipboard!', 'success')
  } else {
    showSnackbar('Unable to copy score. Please copy manually.', 'warning')
  }
}

// ============================================================================
// Utility Functions
// ============================================================================
/**
 * Shows a snackbar notification
 */
function showSnackbar(message: string, color: SnackbarColor = 'info') {
  snackbar.value.message = message
  snackbar.value.color = color
  snackbar.value.show = true
}

/**
 * Handles physical keyboard input
 */
function handlePhysicalKey(event: KeyboardEvent) {
  const key = event.key.toUpperCase()
  if (key === 'ENTER' || key === 'BACKSPACE') {
    event.preventDefault()
    handleKeyInput(key === 'BACKSPACE' ? 'BACK' : 'ENTER')
    return
  } else if (/^[A-Z]$/.test(key)) {
    handleKeyInput(key)
  } else if (/^[^A-Z]$/.test(key) && !shareMenu.value) {
    showSnackbar(`Invalid key: "${key}". Please enter a letter.`, "warning")
  }
}

// ============================================================================
// Watchers & Lifecycle
// ============================================================================

// Watch route changes to sync word from URL
watch(
  () => [route.params.hash, route.query.word],
  () => {
    syncWordFromRoute(true)
  },
  { immediate: true },
)

// Normalize custom word input as user types
watch(customWordInput, (value) => {
  const normalized = normalizeWordInput(value)
  if (value !== normalized) {
    customWordInput.value = normalized
  }
})

// Clear errors when share menu closes
watch(shareMenu, (isOpen) => {
  if (!isOpen) {
    customWordError.value = ''
  }
})

// Save state when hard mode changes
watch(hardMode, () => {
  saveCurrentGameState()
})

// Save state when current guess changes (debounced auto-save)
let saveTimeout: ReturnType<typeof setTimeout> | null = null
watch(currentGuess, () => {
  if (saveTimeout) {
    clearTimeout(saveTimeout)
  }
  saveTimeout = setTimeout(() => {
    saveCurrentGameState()
  }, 500)
})

// Set up physical keyboard listeners
onMounted(() => {
  window.addEventListener('keyup', handlePhysicalKey)
})

onBeforeUnmount(() => {
  window.removeEventListener('keyup', handlePhysicalKey)
})
</script>

<template>
  <v-main class="wordle-main">
    <v-card class="pa-6 wordle-card" max-width="640" elevation="8">
      <!-- Header Section with Hamburger Menu -->
      <div class="d-flex align-center justify-space-between mb-4">
        <!-- Hamburger Menu -->
        <v-menu location="bottom start" :close-on-content-click="false">
          <template #activator="{ props }">
            <v-btn icon="mdi-menu" variant="text" v-bind="props" class="hamburger-menu-btn" />
          </template>
          <v-card class="menu-card" min-width="280">
            <v-card-title class="text-subtitle-1 font-weight-semibold">
              Game Options
            </v-card-title>
            <v-divider />
            <v-card-text class="pa-0">
              <v-list density="compact" class="pa-0">
                <!-- Hard Mode Toggle -->
                <v-list-item>
                  <v-tooltip location="right">
                    <template #activator="{ props: tooltipProps }">
                      <div v-bind="tooltipProps" class="d-flex align-center justify-space-between w-100">
                        <span class="text-body-2">Hard Mode</span>
                        <v-switch
                          v-model="hardMode"
                          hide-details
                          density="compact"
                          color="orange-darken-2"
                          class="ma-0"
                        />
                      </div>
                    </template>
                    <span>Hard mode: Use all discovered letters. Green letters must stay in place. Yellow
                      letters must be used in a different position.</span>
                  </v-tooltip>
                </v-list-item>
                <v-divider />
                <!-- Free Play / Daily Game -->
                <v-list-item>
                  <v-btn
                    v-if="!isRandomWordActive && !isCustomWordActive"
                    prepend-icon="mdi-dice-multiple"
                    color="purple-accent-2"
                    variant="tonal"
                    block
                    @click="startRandomWord"
                  >
                    Free Play
                  </v-btn>
                  <v-btn
                    v-else
                    prepend-icon="mdi-calendar-blank"
                    color="purple-accent-2"
                    variant="tonal"
                    block
                    @click="returnToDailyPuzzle"
                  >
                    Daily Game
                  </v-btn>
                </v-list-item>
                <v-divider />
                <!-- Custom Game -->
                <v-list-item>
                  <v-btn
                    prepend-icon="mdi-plus"
                    variant="tonal"
                    color="blue"
                    block
                    @click="shareMenu = true"
                  >
                    Custom Game
                  </v-btn>
                </v-list-item>
                <v-divider />
                <!-- Remaining Words -->
                <v-list-item>
                  <v-btn
                    prepend-icon="mdi-text-search"
                    variant="tonal"
                    color="green"
                    block
                    @click="helpMenu = true"
                  >
                    Remaining Words
                  </v-btn>
                </v-list-item>
                <v-divider />
              </v-list>
            </v-card-text>
          </v-card>
        </v-menu>

        <!-- Header Content -->
        <div class="flex-grow-1 text-center">
          <p class="text-body-1 text-grey-lighten-1 mb-1">
            Guess the hidden {{ WORD_LENGTH }}-letter word in {{ MAX_ATTEMPTS }} tries.
          </p>
          <p class="text-caption text-grey-lighten-1">
            {{ activeWordLabel }} · Daily #{{ puzzleNumber }} · {{ puzzleDateLabel }}
          </p>
        </div>

        <!-- Spacer for alignment -->
        <div style="width: 48px"></div>
      </div>

      <!-- Custom Game Menu (separate menu) -->
      <v-menu v-model="shareMenu" :close-on-content-click="false">
        <template #activator="{ props }">
          <div style="display: none" v-bind="props"></div>
        </template>
        <v-card class="share-menu-card" max-width="360">
          <v-card-title class="text-subtitle-1 font-weight-semibold">
            Creator tools
          </v-card-title>
          <v-divider class="mb-2" />
          <v-card-text>
            <p class="text-body-2 text-grey-lighten-1 mb-3">
              Share a custom 5-letter puzzle with friends. Loading it here updates the board
              immediately.
            </p>
            <v-text-field v-model="customWordInput" label="Custom word" maxlength="5" counter="5"
              hide-details="auto" density="comfortable" class="mb-3" />
            <v-btn block color="secondary" variant="flat" @click="createCustomPuzzle">
              Load & share
            </v-btn>
            <v-alert v-if="customWordError" type="error" class="mt-3" density="comfortable">
              {{ customWordError }}
            </v-alert>
            <v-alert v-else-if="customShareLink" type="success" class="mt-3" variant="tonal" density="comfortable">
              <div class="d-flex flex-column gap-2">
                <span class="font-mono text-break text-body-2">{{ customShareLink }}</span>
                <div class="d-flex ga-2 flex-wrap">
                  <v-btn size="small" variant="tonal" color="primary" @click="copyShareLink">
                    {{ shareCopied ? 'Copied!' : 'Copy link' }}
                  </v-btn>
                </div>
              </div>
            </v-alert>
            <v-btn v-if="isCustomWordActive || isRandomWordActive" class="mt-4" variant="text"
              prepend-icon="mdi-calendar-blank" @click="returnToDailyPuzzle">
              Back to daily word
            </v-btn>
            <v-btn v-if="!isRandomWordActive" class="mt-2" block variant="outlined" color="purple-accent-2"
              prepend-icon="mdi-dice-multiple" @click="startRandomWord">
              Play random word
            </v-btn>
          </v-card-text>
          <v-card-actions class="justify-end">
            <v-btn variant="text" @click="shareMenu = false">Close</v-btn>
          </v-card-actions>
        </v-card>
      </v-menu>

      <!-- Remaining Words Menu (separate menu) -->
      <v-menu v-model="helpMenu" :close-on-content-click="false" class="overflow-hidden">
        <template #activator="{ props }">
          <div style="display: none" v-bind="props"></div>
        </template>
        <v-card class="share-menu-card overflow-hidden" max-width="360">
          <v-card-title class="text-subtitle-1 font-weight-semibold">
            Remaining Words
          </v-card-title>
          <v-divider class="mb-2" />
          <v-virtual-scroll height="500px" max-height="90vh" :items="analysisData.remainingCandidates">
            <template v-slot:default="{ item, index }">
              {{ index + 1 }}. {{ item }}
            </template>
          </v-virtual-scroll>
          <v-card-actions class="justify-end">
            <v-btn variant="text" @click="helpMenu = false">Close</v-btn>
          </v-card-actions>
        </v-card>
      </v-menu>

      <!-- Game Board -->
      <div class="wordle-grid" aria-label="Guess grid">
        <div v-for="(row, rowIndex) in boardRows" :key="`row-${rowIndex}`" class="wordle-row">
          <div v-for="(letter, colIndex) in row.letters" :key="`col-${colIndex}`" class="wordle-tile" :class="[
            `wordle-tile--${row.statuses[colIndex]}`,
            { 'wordle-tile--filled': letter !== '' },
          ]">
            <span>{{ letter }}</span>
          </div>
        </div>
      </div>

      <!-- Status Message & Actions -->
      <div class="text-center my-4">
        <p v-if="gameState === 'lost'" class="text-subtitle-1 font-weight-semibold text-error">
          {{ `Out of tries. The word was ${targetWord}.` }}
        </p>
        <p v-if="gameState !== 'playing'" class="text-subtitle-1 text-grey-lighten-1">
          Continue playing with
          <v-btn prepend-icon="mdi-dice-multiple" size="small" color="purple-accent-2" variant="tonal"
            @click="startRandomWord" text="Free Play" />
        </p>
        <div v-if="gameFinished" class="d-flex ga-2 justify-center flex-wrap mt-3">
          <v-btn color="secondary" variant="outlined" prepend-icon="mdi-chart-box-outline"
            @click="analysisDialog = true">
            View analysis
          </v-btn>
          <v-btn color="success" variant="flat" prepend-icon="mdi-share-variant" @click="shareScore">
            Share score
          </v-btn>
        </div>
      </div>

      <!-- On-screen Keyboard -->
      <div v-if="gameState === 'playing'" class="wordle-keyboard mt-6" aria-label="On-screen keyboard">
        <div v-for="row in keyboardRows" :key="row.toString()" class="keyboard-row">
          <v-btn v-for="key in row" :key="key" class="keyboard-key" :class="keyboardClass(key)" color="blue-darken-4"
            variant="flat" height="48" @click="handleKeyInput(key)">
            <template v-if="key === 'BACK'">
              <v-icon icon="mdi-backspace-outline" />
            </template>
            <template v-else>
              {{ key === 'ENTER' ? 'Enter' : key }}
            </template>
          </v-btn>
        </div>
      </div>
    </v-card>

    <!-- Snackbar Notifications -->
    <v-snackbar v-model="snackbar.show" :timeout="2400" :color="snackbar.color" location="top">
      {{ snackbar.message }}
    </v-snackbar>

<!-- Analysis Dialog -->
<v-dialog v-model="analysisDialog" width="900">
  <v-card>
    <v-card-title class="d-flex align-center justify-space-between">
      <div>
        <p class="text-overline mb-1">Post-game insights</p>
        <span class="text-h5">Gameplay analysis</span>
      </div>
      <v-btn icon="mdi-close" variant="text" @click="analysisDialog = false" />
    </v-card-title>

    <v-card-text>
      <v-table density="compact" class="mb-4">
        <thead>
          <tr>
            <th>#</th>
            <th>Guess</th>
            <th>Remaining</th>
            <th>Info</th>
            <th>Luck</th>
          </tr>
        </thead>

        <tbody>
          <tr v-for="(row, index) in analysisData.rows" :key="row.guess + index">
            <td>{{ index + 1 }}</td>

            <td class="text-uppercase font-weight-medium">
              {{ row.guess }}
            </td>

            <td>{{ row.remaining }}</td>

            <td>{{ row.infoGainedPercent.toFixed(2) }}</td>

            <td>
              <span
                :class="row.luck > 0 ? 'text-green-accent-4' : 'text-red-accent-2'"
              >
                {{ row.luck.toFixed(2) }}
              </span>
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card-text>

    <v-card-actions class="justify-end">
      <v-btn variant="text" @click="analysisDialog = false">Close</v-btn>
    </v-card-actions>
  </v-card>
</v-dialog>
  </v-main>
</template>

<style scoped>
.wordle-main {
  background: radial-gradient(circle at top, rgba(45, 212, 191, 0.08), transparent 60%), #020617;
  min-height: 100vh;
  display: flex;
  align-items: flex-start;
  justify-content: center;
}

.wordle-card {
  background: rgba(15, 23, 42, 0.92);
  border: 1px solid rgba(148, 163, 184, 0.12);
  backdrop-filter: blur(12px);
}

.wordle-grid {
  display: grid;
  row-gap: 8px;
}

.wordle-row {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 68px));
  gap: 8px;
  justify-content: center;
}

.wordle-tile {
  border: 2px solid rgba(148, 163, 184, 0.25);
  aspect-ratio: 1 / 1;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  font-weight: 700;
  color: #e2e8f0;
  text-transform: uppercase;
  transition:
    background 0.2s ease,
    transform 0.2s ease,
    border-color 0.2s ease;
  background: rgba(15, 23, 42, 0.6);
}

.wordle-tile--filled {
  border-color: rgba(148, 163, 184, 0.7);
}

.wordle-tile--correct {
  background: #22c55e;
  border-color: #22c55e;
  color: #032311;
}

.wordle-tile--present {
  background: #eab308;
  border-color: #eab308;
  color: #2b1a00;
}

.wordle-tile--absent {
  background: rgba(51, 65, 85, 0.6);
  border-color: rgba(100, 116, 139, 0.5);
  color: #cbd5f5;
}

.wordle-keyboard {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.keyboard-row {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: nowrap;
}

.keyboard-key {
  min-width: 40px;
  font-weight: 600;
  color: #e2e8f0;
  text-transform: uppercase;
  background: rgba(15, 23, 42, 0.8);
  border-radius: 8px;
}

.keyboard-key--action {
  flex: 1.2;
  background: rgba(59, 130, 246, 0.3);
  color: #bfdbfe;
}

.keyboard-key--correct {
  background: #22c55e !important;
  color: #022c16;
}

.keyboard-key--present {
  background: #eab308 !important;
  color: #2b1a00;
}

.keyboard-key--absent {
  background: rgba(71, 85, 105, 0.9) !important;
  color: #cbd5f5;
}

.keyboard-key--empty {
  background: rgba(30, 41, 59, 0.8);
}

.remaining-chip-group {
  gap: 8px;
}

.text-break {
  word-break: break-all;
}

.hamburger-menu-btn {
  position: relative;
  z-index: 1;
}

.menu-card {
  border-radius: 8px;
}

@media (max-width: 600px) {
  .wordle-card {
    padding: 24px !important;
  }

  .wordle-row {
    grid-template-columns: repeat(5, minmax(0, 56px));
    gap: 6px;
  }

  .keyboard-row {
    gap: 6px;
  }

  .keyboard-key {
    font-size: 0.85rem;
    min-width: 20px;
    width: 28px;
  }

  .keyboard-key--action {
    width: 54px;
    min-width: 54px;
  }
}
</style>
