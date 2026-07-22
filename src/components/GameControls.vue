<script setup lang="ts">
/**
 * The always-visible controls dock for a grid game. Lives in the open space a
 * square board leaves — beside the board on a wide screen, below it on a narrow
 * one (see `.game-stage` in app.css).
 *
 * Primary actions (New game, Hint, …) go in the `#actions` slot and stay pinned
 * and always visible. Tunable settings go in the default slot, inside a
 * scrollable panel — so a long settings list (e.g. chess) never pushes the
 * board or the actions off-screen.
 */
defineProps<{ title?: string }>()
</script>

<template>
  <div class="game-controls">
    <div v-if="$slots.actions" class="d-flex flex-wrap ga-2 mb-3">
      <slot name="actions" />
    </div>
    <v-card v-if="$slots.default" class="game-controls__panel pa-4" color="surface" variant="tonal" rounded="lg">
      <div class="text-overline text-medium-emphasis mb-2">{{ title || 'Settings' }}</div>
      <div class="game-controls__scroll d-flex flex-column ga-4">
        <slot />
      </div>
    </v-card>
  </div>
</template>

<style scoped>
.game-controls {
  width: 100%;
}
/* Only the settings list scrolls; the actions above it stay put. Capped so a
   tall list (chess) stays compact instead of running down the page. */
.game-controls__scroll {
  max-height: min(46vh, 380px);
  overflow-y: auto;
  /* a little room so the scrollbar doesn't sit on top of the slider thumbs */
  padding-right: 6px;
}
</style>
