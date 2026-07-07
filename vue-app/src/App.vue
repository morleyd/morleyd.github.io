<script setup>
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDisplay } from 'vuetify'
import AppBar from '@/components/AppBar.vue'

const route = useRoute()
const router = useRouter()
const { mobile } = useDisplay()

// Hide the top bar when a route opts out entirely (Wordle) or, for game pages,
// on mobile only — where vertical space is tight (desktop keeps the nav).
const hideAppBar = computed(
  () => route.meta.hideAppBar || (route.meta.gamePage && mobile.value),
)

// On mobile, lock page scroll for board games so they fill the screen and
// touch-dragging tiles doesn't scroll the page (opt-in via route meta).
const lockScroll = computed(() => route.meta.lockScroll && mobile.value)
watch(
  lockScroll,
  (lock) => {
    document.documentElement.style.overflow = lock ? 'hidden' : ''
  },
  { immediate: true },
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
