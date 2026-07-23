<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { burstConfetti } from '@/services/confetti'

interface Tile {
  letter: string
  status: 'correct' | 'present' | 'absent'
}

interface GameCard {
  key: string
  title: string
  description: string
  icon: string
  to: string
  gradient: string
  tiles?: Tile[]
}

const tiles = (word: string, statuses: Tile['status'][]): Tile[] =>
  word.split('').map((letter, i) => ({ letter, status: statuses[i] }))

const games: GameCard[] = [
  {
    key: 'wordle',
    title: 'Wordle',
    description:
      'Guess the hidden 5-letter word in six tries. Daily puzzle, hard mode, shareable custom words, and post-game analysis.',
    icon: 'mdi-grid',
    to: '/wordle',
    gradient: 'linear-gradient(135deg, rgba(142, 36, 170, 0.42), rgba(45, 212, 191, 0.18))',
    tiles: tiles('GUESS', ['correct', 'absent', 'present', 'absent', 'correct']),
  },
  {
    key: 'helper',
    title: 'Wordle Helper',
    description:
      'A solver companion: enter what you know — greens, wrong-spot letters, and dead letters — and see every word that still fits.',
    icon: 'mdi-lightbulb-on-outline',
    to: '/wordle-helper',
    gradient: 'linear-gradient(135deg, rgba(142, 36, 170, 0.42), rgba(234, 179, 8, 0.20))',
    tiles: tiles('CHEAT', ['present', 'present', 'correct', 'correct', 'absent']),
  },
  {
    key: 'wizard-chess',
    title: 'Wizard Chess',
    description:
      'Real chess against an engine — but every piece is a named character with a temper, who gloats, panics, and holds grudges as the battle unfolds.',
    icon: 'mdi-chess-queen',
    to: '/wizard-chess',
    gradient: 'linear-gradient(135deg, rgba(142, 36, 170, 0.42), rgba(15, 23, 42, 0.35))',
  },
  {
    key: 'gradient-sort',
    title: 'Gradient Sort',
    description:
      'Rearrange a scrambled grid of colors back into a smooth gradient in as few swaps as possible.',
    icon: 'mdi-view-grid-outline',
    to: '/gradient-sort',
    gradient: 'linear-gradient(135deg, hsl(0, 70%, 55%), hsl(140, 68%, 48%), hsl(255, 70%, 58%))',
  },
  {
    key: 'flood-it',
    title: 'Flood It',
    description:
      'Flood the board from one corner, picking colors to grow your region until everything is a single color.',
    icon: 'mdi-format-color-fill',
    to: '/flood-it',
    gradient: 'linear-gradient(135deg, rgba(59, 130, 246, 0.35), rgba(34, 197, 94, 0.28))',
  },
  {
    key: 'mini-golf',
    title: 'Mini Golf',
    description:
      'Nine seeded holes. Pull back to aim and set power, then putt — bank off the walls and sink it in as few strokes as you can.',
    icon: 'mdi-golf',
    to: '/mini-golf',
    gradient: 'linear-gradient(135deg, rgba(22, 101, 52, 0.5), rgba(52, 211, 153, 0.3))',
  },
  {
    key: 'count-blocks',
    title: 'Count the Blocks',
    description:
      'A pattern of blocks flashes on screen for a moment — then say how many blocks it had. It grows bigger and flashes quicker as you level up.',
    icon: 'mdi-counter',
    to: '/count-blocks',
    gradient: 'linear-gradient(135deg, rgba(168, 85, 247, 0.36), rgba(34, 211, 238, 0.28))',
  },
  {
    key: 'color-memory',
    title: 'Color from Memory',
    description:
      'A color flashes for a few seconds — then recreate it from memory with RGB sliders. Scored on how close it looks, not just the numbers.',
    icon: 'mdi-palette-outline',
    to: '/color-memory',
    gradient: 'linear-gradient(135deg, hsl(330, 80%, 55%), hsl(190, 80%, 50%), hsl(50, 90%, 55%))',
  },
  {
    key: 'ninja-climb',
    title: 'Ninja Climb',
    description:
      'Cling to a wall, hold to charge, and leap to the other side — longer holds jump higher. Dodge spikes and outclimb the rising lava.',
    icon: 'mdi-ninja',
    to: '/ninja-climb',
    gradient: 'linear-gradient(135deg, rgba(56, 189, 248, 0.34), rgba(239, 68, 68, 0.32))',
  },
  {
    key: 'ball-bounce',
    title: 'Ball Bounce',
    description:
      'A doodle-jump climber: the ball bounces on its own, you steer left/right to land the next platform. The screen only rises — don’t drop off.',
    icon: 'mdi-circle-outline',
    to: '/ball-bounce',
    gradient: 'linear-gradient(135deg, rgba(52, 211, 153, 0.34), rgba(244, 114, 182, 0.3))',
  },
  {
    key: 'tunnel',
    title: 'Vertical Tunnel',
    description:
      'Steer a circle up an endless, narrowing tunnel — tap the left or right side to nudge that way, and don’t drift into the walls. It speeds up as you climb.',
    icon: 'mdi-airplane',
    to: '/tunnel',
    gradient: 'linear-gradient(135deg, rgba(56, 189, 248, 0.38), rgba(244, 114, 182, 0.3))',
  },
  {
    key: '2048',
    title: '2048',
    description:
      'Slide and merge numbered tiles to reach 2048 — then keep going. Swipe or arrow keys, one-level undo, and a saved best score.',
    icon: 'mdi-numeric',
    to: '/2048',
    gradient: 'linear-gradient(135deg, rgba(249, 115, 22, 0.42), rgba(250, 204, 21, 0.24))',
  },
  {
    key: 'tetris',
    title: 'Tetris',
    description:
      'The falling-blocks classic: rotate and stack tetrominoes to clear lines. Ghost piece, hold slot, next queue, and rising speed.',
    icon: 'mdi-view-quilt-outline',
    to: '/tetris',
    gradient: 'linear-gradient(135deg, rgba(34, 211, 238, 0.32), rgba(168, 85, 247, 0.30))',
  },
  {
    key: 'nonogram',
    title: 'Nonogram',
    description:
      'Reveal a hidden pixel picture by filling cells that satisfy the row and column number clues. Drag to paint, X-mark the gaps, three sizes.',
    icon: 'mdi-dots-grid',
    to: '/nonogram',
    gradient: 'linear-gradient(135deg, rgba(124, 58, 237, 0.4), rgba(15, 23, 42, 0.3))',
  },
  {
    key: 'connect-4',
    title: 'Connect 4',
    description:
      'Drop discs to line up four in a row against a negamax AI with alpha-beta pruning. Three difficulties and you choose who starts.',
    icon: 'mdi-circle-multiple-outline',
    to: '/connect-4',
    gradient: 'linear-gradient(135deg, rgba(37, 99, 235, 0.4), rgba(234, 179, 8, 0.28))',
  },
  {
    key: 'sudoku',
    title: 'Sudoku',
    description:
      'The classic 1–9 logic puzzle, in four difficulties. Pencil notes, conflict highlighting, hints, and a fresh guaranteed-unique board every time.',
    icon: 'mdi-grid-large',
    to: '/sudoku',
    gradient: 'linear-gradient(135deg, rgba(59, 130, 246, 0.36), rgba(148, 163, 184, 0.18))',
  },
  {
    key: 'tango',
    title: 'Tango',
    description:
      'Fill a 6×6 grid with Suns and Moons: balance every row and column, no three in a row, and honor the =/× links. Pure logic, always solvable.',
    icon: 'mdi-weather-sunny',
    to: '/tango',
    gradient: 'linear-gradient(135deg, rgba(250, 204, 21, 0.34), rgba(129, 140, 248, 0.30))',
  },
  {
    key: 'snake',
    title: 'Snake',
    description:
      'The classic: guide the snake to eat and grow without hitting the walls or yourself. Keyboard, d-pad, or swipe.',
    icon: 'mdi-snake',
    to: '/snake',
    gradient: 'linear-gradient(135deg, rgba(142, 36, 170, 0.42), rgba(52, 211, 153, 0.22))',
  },
  {
    key: 'minesweeper',
    title: 'Minesweeper',
    description:
      'Clear the board without detonating a mine. Use the number clues to deduce where the mines hide.',
    icon: 'mdi-mine',
    to: '/minesweeper',
    gradient: 'linear-gradient(135deg, rgba(142, 36, 170, 0.42), rgba(248, 113, 113, 0.24))',
  },
  {
    key: 'lights-out',
    title: 'Lights Out',
    description:
      'Flip lights and their neighbors to turn the whole board off. Every puzzle scored against the true optimal.',
    icon: 'mdi-lightbulb-group-outline',
    to: '/lights-out',
    gradient: 'linear-gradient(135deg, rgba(142, 36, 170, 0.42), rgba(251, 191, 36, 0.24))',
  },
  {
    key: 'simon',
    title: 'Simon',
    description:
      'Watch a growing color sequence light up, then repeat it back from memory. One more step every round — a single wrong tap ends the run.',
    icon: 'mdi-view-grid',
    to: '/simon',
    gradient: 'linear-gradient(135deg, rgba(239, 68, 68, 0.32), rgba(250, 204, 21, 0.28))',
  },
  {
    key: 'memory',
    title: 'Memory',
    description:
      'A concentration board: flip face-down cards two at a time to find every matching pair in as few moves as you can.',
    icon: 'mdi-cards-outline',
    to: '/memory',
    gradient: 'linear-gradient(135deg, rgba(52, 211, 153, 0.32), rgba(59, 130, 246, 0.3))',
  },
  {
    key: 'nerdle',
    title: 'Nerdle',
    description:
      'Wordle for math: guess the hidden 8-tile equation in six tries. Tiles reveal which digits and operators are right, and where.',
    icon: 'mdi-calculator-variant-outline',
    to: '/nerdle',
    gradient: 'linear-gradient(135deg, rgba(34, 197, 94, 0.34), rgba(168, 85, 247, 0.30))',
  },
  {
    key: 'time-since',
    title: 'Time Since',
    description:
      'A live count-up clock tracking the time elapsed since a fixed moment, with a small future-time calculator.',
    icon: 'mdi-clock-outline',
    to: '/time-since',
    gradient: 'linear-gradient(135deg, rgba(142, 36, 170, 0.42), rgba(59, 130, 246, 0.22))',
  },
]

// Easter egg: the Konami code (↑↑↓↓←→←→BA) rains confetti on the arcade.
const KONAMI = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
  'b', 'a',
]
const konamiFound = ref(false)
let konamiPos = 0
const onKonamiKey = (e: KeyboardEvent) => {
  // Letters compare case-insensitively (Shift/CapsLock 'B'/'A' still count).
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
  if (key === KONAMI[konamiPos]) konamiPos += 1
  // On a mismatching ArrowUp, fall back to the longest matching prefix (↑↑
  // stays ↑↑ — an extra wind-up press shouldn't scrap the attempt).
  else if (key === KONAMI[0]) konamiPos = konamiPos === 2 ? 2 : 1
  else konamiPos = 0
  if (konamiPos === KONAMI.length) {
    konamiPos = 0
    konamiFound.value = true
    burstConfetti({ count: 200, power: 1.3 })
  }
}
onMounted(() => window.addEventListener('keydown', onKonamiKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKonamiKey))
</script>

<template>
  <v-container class="py-6" max-width="1100">
    <div class="mb-6">
      <h1 class="page-title">Games</h1>
      <p class="text-body-1 text-medium-emphasis">
        A small collection of games and tools. More on the way.
        <span v-if="konamiFound"> 🎮 Cheat code accepted — you found the arcade’s secret.</span>
      </p>
    </div>

    <v-row dense>
      <v-col v-for="game in games" :key="game.key" cols="12" sm="6" md="4">
        <v-card :to="game.to" hover class="h-100 d-flex flex-column" color="surface" elevation="6" rounded="lg">
          <!-- Hero: each card gets a subtly different gradient -->
          <div class="hero" :style="{ background: game.gradient }">
            <div v-if="game.tiles" class="hero-tiles">
              <span
                v-for="(t, i) in game.tiles"
                :key="i"
                class="hero-tile"
                :class="`hero-tile--${t.status}`"
              >{{ t.letter }}</span>
            </div>
            <v-icon v-else :icon="game.icon" size="72" />
          </div>

          <v-card-title class="d-flex align-center ga-2">
            <v-icon :icon="game.icon" size="small" />
            {{ game.title }}
          </v-card-title>

          <v-card-text class="flex-grow-1 text-medium-emphasis pb-4">
            {{ game.description }}
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
.hero {
  height: 150px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #e2e8f0;
  background: linear-gradient(135deg, rgba(142, 36, 170, 0.4), rgba(45, 212, 191, 0.18));
}

.hero-tiles {
  display: flex;
  gap: 8px;
}

.hero-tile {
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  font-weight: 700;
  font-size: 1.25rem;
  color: #e2e8f0;
  border: 2px solid rgba(226, 232, 240, 0.35);
}
.hero-tile--correct { background: #22c55e; border-color: #22c55e; color: #032311; }
.hero-tile--present { background: #eab308; border-color: #eab308; color: #2b1a00; }
.hero-tile--absent { background: rgba(30, 41, 59, 0.75); border-color: rgba(148, 163, 184, 0.5); }
</style>
