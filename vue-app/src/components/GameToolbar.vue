<script setup lang="ts">
/**
 * Compact header for game pages.
 * - Desktop: full title + intro + inline settings (plenty of room).
 * - Mobile: a slim bar with a back-to-Games button, the title, and a cog menu
 *   holding the settings — so the game itself fits without scrolling.
 * The global app bar is hidden on mobile for these routes (see App.vue).
 */
import { useDisplay } from 'vuetify'
import { useRouter } from 'vue-router'

defineProps<{ title: string }>()

const { mobile } = useDisplay()
const router = useRouter()
</script>

<template>
  <!-- Mobile: slim toolbar -->
  <div v-if="mobile" class="d-flex align-center ga-1 mb-3">
    <v-btn icon="mdi-arrow-left" variant="text" density="comfortable" @click="router.push({ name: 'games' })" />
    <h1 class="page-title page-title--flush mb-0 flex-grow-1 text-truncate">{{ title }}</h1>
    <v-menu v-if="$slots.settings" location="bottom end" :close-on-content-click="false">
      <template #activator="{ props }">
        <v-btn icon="mdi-cog-outline" variant="text" density="comfortable" v-bind="props" />
      </template>
      <v-card min-width="290" class="pa-4">
        <slot name="settings" />
      </v-card>
    </v-menu>
  </div>

  <!-- Desktop: full header -->
  <div v-else class="mb-4">
    <h1 class="page-title">{{ title }}</h1>
    <p v-if="$slots.intro" class="text-body-1 text-medium-emphasis mb-0">
      <slot name="intro" />
    </p>
    <div v-if="$slots.settings" class="mt-4">
      <slot name="settings" />
    </div>
  </div>
</template>
