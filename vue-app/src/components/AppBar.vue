<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router'
import { useDisplay } from 'vuetify';
import logoSrc from '@/assets/DavidPixel192x192.png';

const route = useRoute()
const { mobile } = useDisplay();

const menuItems = [
  { title: 'Home', value: 'home', icon: 'mdi-home-outline' },
  { title: 'Games', value: 'games', icon: 'mdi-gamepad-variant-outline' },
  { title: 'Contact', value: 'contact', icon: 'mdi-message-fast-outline' }
];

// Routes that live under the "Games" section, so that nav entry stays highlighted.
const gamesRouteNames = new Set(['games', 'wordle', 'wordle-helper', 'time-since'])

// One-way highlight only. Navigation is handled by router-link (`to`) on each item,
// which avoids v-tabs firing a spurious push to the first tab during mount.
const activeTab = computed(() => (gamesRouteNames.has(route.name) ? 'games' : route.name))
</script>
<template>
  <v-app-bar class="app-bar-gradient text-white">
    <!-- Left Side: Logo -->
    <div class="ml-4 d-flex align-center cursor-pointer" @click="$router.push({ name: 'home' })">
      <img class="pa-2" style="max-height: 56px" :src="logoSrc" alt="David Morley logo" />
      <span class="text-h4"> David Morley</span>
    </div>

    <v-spacer></v-spacer>

    <!-- Desktop Tabs -->
    <v-tabs v-if="!mobile" :model-value="activeTab" bg-color="transparent" color="orange-lighten-3" align-tabs="end">
      <template v-for="item in menuItems" :key="item.value">
        <v-tab :prepend-icon="item.icon" :value="item.value" :to="{ name: item.value }">
          {{ item.title }}
        </v-tab>
      </template>
    </v-tabs>

    <!-- Mobile Menu -->
    <v-menu v-else>
      <template v-slot:activator="{ props }">
        <v-btn v-bind="props" icon="mdi-menu"></v-btn>
      </template>
      <v-list>
        <template v-for="item in menuItems" :key="item.value">
          <v-list-item :to="{ name: item.value }">
            <template v-slot:prepend>
              <v-icon :icon="item.icon"></v-icon>
            </template>
            <v-list-item-title>{{ item.title }}</v-list-item-title>
          </v-list-item>
        </template>
      </v-list>
    </v-menu>
  </v-app-bar>
</template>

<style scoped>
/* Subtle diagonal from the bar's purple toward the footer's darker purple,
   so the header and footer feel connected. */
.app-bar-gradient {
  background: linear-gradient(100deg, #8e24aa 0%, #6a1b9a 55%, #4a148c 100%) !important;
}
</style>
