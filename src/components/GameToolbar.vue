<script setup lang="ts">
/**
 * Shared header for game pages.
 * - Desktop: title + intro, with info & share actions.
 * - Mobile: slim bar (back / title / info / share); the game fills the screen.
 *   The global app bar is hidden on mobile for these routes.
 * Game settings/actions are NOT here — they live in the always-visible controls
 * dock beside/below the board (GameControls), so nothing is buried in a menu.
 */
import { ref } from 'vue'
import { useDisplay } from 'vuetify'
import { useRouter } from 'vue-router'

defineProps<{ title: string; shareable?: boolean }>()
const emit = defineEmits<{ share: [] }>()

const { mobile } = useDisplay()
const router = useRouter()
const infoOpen = ref(false)
</script>

<template>
  <!-- Mobile: slim toolbar -->
  <div v-if="mobile" class="d-flex align-center ga-1 mb-3">
    <v-btn icon="mdi-arrow-left" variant="text" density="comfortable" @click="router.push({ name: 'games' })" />
    <h1 class="page-title page-title--flush mb-0 flex-grow-1 text-truncate">{{ title }}</h1>
    <v-btn v-if="$slots.info" icon="mdi-information-outline" variant="text" density="comfortable" @click="infoOpen = true" />
    <v-btn v-if="shareable" icon="mdi-share-variant" variant="text" density="comfortable" @click="emit('share')" />
  </div>

  <!-- Desktop: title, intro, and info/share actions. Game settings live in the
       always-visible controls dock beside/below the board (see GameControls),
       not in a cog — a square board leaves plenty of room for them. -->
  <div v-else class="mb-4">
    <div class="d-flex align-center ga-2">
      <h1 class="page-title mb-0">{{ title }}</h1>
      <v-spacer />
      <v-btn v-if="$slots.info" icon="mdi-information-outline" variant="text" @click="infoOpen = true" />
      <v-btn v-if="shareable" icon="mdi-share-variant" variant="text" @click="emit('share')" />
    </div>
    <p v-if="$slots.intro" class="text-body-1 text-medium-emphasis mb-0 mt-2">
      <slot name="intro" />
    </p>
  </div>

  <!-- Info dialog (both breakpoints) -->
  <v-dialog v-model="infoOpen" max-width="520" scrollable>
    <v-card color="surface">
      <v-card-title class="d-flex align-center justify-space-between">
        <span>{{ title }}</span>
        <v-btn icon="mdi-close" variant="text" size="small" @click="infoOpen = false" />
      </v-card-title>
      <v-divider />
      <v-card-text class="game-info">
        <slot name="info" />
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

