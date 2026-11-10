<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router'
import { useDisplay } from 'vuetify';
import logoSrc from '@/assets/DavidPixel192x192.png';
import { profile } from '@/data/portfolio'

const route = useRoute()
const { mobile } = useDisplay();

const menuItems = [
  { title: 'Work', value: 'work', icon: 'mdi-briefcase-outline' },
  { title: 'Playground', value: 'games', icon: 'mdi-gamepad-variant-outline' },
  { title: 'About', value: 'about', icon: 'mdi-account-outline' }
];

// Non-game routes that still live under "Playground", so that entry stays highlighted.
const playgroundRouteNames = new Set(['games', 'time-since', 'gallery'])

// One-way highlight only. Navigation is handled by router-link (`to`) on each item,
// which avoids v-tabs firing a spurious push to the first tab during mount.
const activeTab = computed(() =>
  route.meta.gamePage || playgroundRouteNames.has(route.name) ? 'games' : route.name,
)
</script>
<template>
  <v-app-bar class="app-bar-gradient text-white">
    <!-- Left Side: Logo -->
    <router-link :to="{ name: 'home' }" class="ml-4 d-flex align-center home-link" aria-label="David Morley, home">
      <img class="pa-2" style="max-height: 56px" :src="logoSrc" alt="" />
      <span class="text-h4"> David Morley</span>
    </router-link>

    <v-spacer></v-spacer>

    <!-- Desktop Tabs -->
    <template v-if="!mobile">
      <v-tabs :model-value="activeTab" :mandatory="false" bg-color="transparent" color="orange-lighten-3" align-tabs="end">
        <template v-for="item in menuItems" :key="item.value">
          <v-tab :prepend-icon="item.icon" :value="item.value" :to="{ name: item.value }" :ripple="false">
            {{ item.title }}
          </v-tab>
        </template>
      </v-tabs>
      <v-btn
        :href="profile.resumeUrl"
        target="_blank"
        variant="outlined"
        class="mx-4"
        prepend-icon="mdi-file-document-outline"
      >
        Résumé
      </v-btn>
    </template>

    <!-- Mobile Menu -->
    <v-menu v-else>
      <template v-slot:activator="{ props }">
        <v-btn v-bind="props" icon="mdi-menu" aria-label="Menu"></v-btn>
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
        <v-list-item :href="profile.resumeUrl" target="_blank">
          <template v-slot:prepend>
            <v-icon icon="mdi-file-document-outline"></v-icon>
          </template>
          <v-list-item-title>Résumé (PDF)</v-list-item-title>
        </v-list-item>
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

.home-link {
  color: inherit;
  text-decoration: none;
}

.home-link:focus-visible {
  outline: 3px solid #fbbf24;
  outline-offset: 2px;
  border-radius: 4px;
}
</style>
