<script setup>
import { computed, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { useDisplay } from 'vuetify'
import AppBar from '@/components/AppBar.vue'

const route = useRoute()
const { mobile } = useDisplay()

// Game pages suppress double-tap zoom and long-press selection (see .game-page
// in app.css). The class goes on <body>, not <v-main>, because Vuetify
// teleports menu/dialog content (settings steppers, info dialogs) into an
// overlay container on <body> — a class inside the app tree would miss them.
watchEffect(() => {
  document.body.classList.toggle('game-page', Boolean(route.meta.gamePage))
})

// Hide the top bar when a route opts out entirely (Wordle) or, for game pages,
// on mobile only — where vertical space is tight (desktop keeps the nav).
// Boards fit via dvh sizing; touch-drag is handled by `touch-action: none` on
// the boards, so no global scroll lock is needed (which could hide content).
const hideAppBar = computed(
  () => route.meta.hideAppBar || (route.meta.gamePage && mobile.value),
)
</script>

<template>
  <v-app>
    <a href="#main" class="skip-link">Skip to content</a>
    <AppBar v-if="!hideAppBar" />

    <v-main id="main" tabindex="-1">
      <router-view />
    </v-main>

    <v-footer color="purple-darken-4 px-12" class="text-white" style="max-height: 40px; height: 40px">
      <span> &copy; {{ new Date().getFullYear() }} &ndash; David C. Morley </span>
      <v-spacer></v-spacer>
      <router-link :to="{ name: 'about' }" class="footer-link">Contact</router-link>
    </v-footer>
  </v-app>
</template>

<style scoped>
.footer-link {
  color: inherit;
}

/* Hidden until a keyboard user tabs to it, then pinned top-left above the app bar. */
.skip-link {
  position: fixed;
  top: 8px;
  left: 8px;
  z-index: 2000;
  padding: 8px 14px;
  border-radius: 6px;
  background: #fbbf24;
  color: #1a1300;
  font-weight: 700;
  transform: translateY(-200%);
}

.skip-link:focus {
  transform: none;
}
</style>
