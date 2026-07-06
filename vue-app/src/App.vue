<script setup>
import { useRoute, useRouter } from 'vue-router'
import AppBar from '@/components/AppBar.vue'

const route = useRoute()
const router = useRouter()

function navTo(value) {
  router.push({ name: value })
}
</script>

<template>
  <v-app>
    <AppBar v-if="!route.meta.hideAppBar" />

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
