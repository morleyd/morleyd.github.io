<script setup lang="ts">
interface GameCard {
  title: string
  description: string
  icon: string
  to: string
  cta: string
  image?: string
}

const games: GameCard[] = [
  {
    title: 'Wordle',
    description:
      'Guess the hidden 5-letter word in six tries. Daily puzzle, hard mode, shareable custom words, and post-game analysis.',
    icon: 'mdi-grid',
    to: '/wordle',
    cta: 'Play Wordle',
    image: '/images/project/wordle.png',
  },
  {
    title: 'Wordle Helper',
    description:
      'A solver companion: enter your guesses, mark each tile green/yellow/gray, and see every word that still fits.',
    icon: 'mdi-lightbulb-on-outline',
    to: '/wordle-helper',
    cta: 'Open Helper',
  },
]
</script>

<template>
  <v-container class="py-8">
    <div class="text-center mb-8">
      <h1 class="text-h3 font-weight-bold mb-2">Games</h1>
      <p class="text-body-1 text-grey-darken-2">A small collection of games and tools. More on the way.</p>
    </div>

    <v-row justify="center">
      <v-col v-for="game in games" :key="game.title" cols="12" sm="6" md="5" lg="4">
        <v-card class="h-100 d-flex flex-column" elevation="6" rounded="lg">
          <v-img
            v-if="game.image"
            :src="game.image"
            height="160"
            cover
            class="bg-grey-lighten-2"
          />
          <div v-else class="d-flex align-center justify-center bg-purple-lighten-4" style="height: 160px">
            <v-icon :icon="game.icon" size="80" color="purple-darken-2" />
          </div>

          <v-card-title class="d-flex align-center ga-2">
            <v-icon :icon="game.icon" />
            {{ game.title }}
          </v-card-title>

          <v-card-text class="flex-grow-1">
            {{ game.description }}
          </v-card-text>

          <v-card-actions>
            <v-btn :to="game.to" color="purple-darken-2" variant="flat" block>
              {{ game.cta }}
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>
