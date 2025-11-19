<script setup>
import { computed } from 'vue';
import { RouterView } from 'vue-router'
import { useRoute, useRouter } from 'vue-router'
import { useDisplay } from 'vuetify';
import logoSrc from '@/assets/DavidPixel192x192.png';

const route = useRoute()
const router = useRouter()
const { mobile } = useDisplay();

const menuItems = [
  { title: 'Home', value: 'home', icon: 'mdi-home-outline' },
  { title: 'Contact', value: 'contact', icon: 'mdi-message-fast-outline' }
];

const activeTab = computed({
  get: () => route.name,
  set: (value) => {
    router.push({ name: value })
  }
});
</script>
<template>
  <v-app-bar color="purple-darken-1">
    <!-- Left Side: Logo -->
    <div @click="activeTab = 'home'" class="ml-4 d-flex align-center cursor-pointer">
      <img class="pa-2" style="max-height: 56px" :src="logoSrc" alt="SPICE Logo" />
      <span class="text-h4"> David Morley</span>
    </div>

    <v-spacer></v-spacer>

    <!-- Desktop Tabs -->
    <v-tabs v-if="!mobile" v-model="activeTab" bg-color="purple-darken-1" color="orange-lighten-3" align-tabs="end">
      <template v-for="item in menuItems" :key="item.value">
        <v-tab :prepend-icon="item.icon" :value="item.value">
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
          <v-list-item @click="activeTab = item.value">
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
