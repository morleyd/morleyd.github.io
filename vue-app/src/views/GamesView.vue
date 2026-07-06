<script setup lang="ts">
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
    key: 'time-since',
    title: 'Time Since',
    description:
      'A live count-up clock tracking the time elapsed since a fixed moment, with a small future-time calculator.',
    icon: 'mdi-clock-outline',
    to: '/time-since',
    gradient: 'linear-gradient(135deg, rgba(142, 36, 170, 0.42), rgba(59, 130, 246, 0.22))',
  },
]
</script>

<template>
  <v-container class="py-6" max-width="1100">
    <div class="mb-6">
      <h1 class="page-title">Games</h1>
      <p class="text-body-1 text-medium-emphasis">A small collection of games and tools. More on the way.</p>
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
