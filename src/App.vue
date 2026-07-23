<script setup>
import { computed, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDisplay } from 'vuetify'
import AppBar from '@/components/AppBar.vue'

const route = useRoute()
const router = useRouter()
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

function navTo(value) {
  router.push({ name: value })
}
</script>

<template>
  <v-app>
    <AppBar v-if="!hideAppBar" />

    <v-main>
      <router-view />
    </v-main>

    <v-footer color="purple-darken-4 px-12" class="text-white" style="max-height: 40px; height: 40px">
      <span> &copy; {{ new Date().getFullYear() }} &ndash; David C. Morley </span>
      <v-spacer></v-spacer>
      <span class="cursor-pointer" @click="navTo('contact')">Contact</span>
    </v-footer>
  </v-app>
</template>
