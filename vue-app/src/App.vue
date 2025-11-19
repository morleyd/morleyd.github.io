<script setup>
import { RouterView, useRouter } from 'vue-router'

const router = useRouter()

function navTo(value) {
  router.push({ name: value })
}
</script>

<template>
  <v-app class="bg-grey-lighten-5">
    
    <v-main>
      <router-view />
    </v-main>

    <v-footer color="purple-darken-4 px-12" class="text-white" style="max-height: 40px; height: 40px">
      <span> &copy; {{ new Date().getFullYear() }} &ndash; David C. Morley </span>
      <v-spacer></v-spacer>
      <span @click="navTo('contact')" target="_blank">Contact</span>
    </v-footer>
  </v-app>
</template>
