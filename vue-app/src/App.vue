<script setup>
import { computed } from 'vue'
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
