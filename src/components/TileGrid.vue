<script setup lang="ts">
import { ref } from 'vue';
import type { Tile } from '@/data/portfolio';

// Round line-art tiles (the site's original project look). Each tile is a real
// <button>, so it's reachable by keyboard; the title and year always show under
// the image, because hover text never appears on a phone.
withDefaults(defineProps<{ tiles: Tile[]; size?: number }>(), { size: 220 });

const dialogOpen = ref(false);
const selected = ref<Tile | null>(null);

function open(tile: Tile) {
  selected.value = tile;
  dialogOpen.value = true;
}

const isExternal = (href: string) => /^https?:/.test(href);
</script>

<template>
  <ul class="tile-grid" :style="{ '--tile-size': `${size}px` }">
    <li v-for="tile in tiles" :key="tile.id">
      <button type="button" class="tile" @click="open(tile)">
        <span class="tile-image">
          <img :src="tile.image" alt="" />
          <span class="tile-hover" aria-hidden="true">{{ tile.blurb }}</span>
        </span>
        <span class="tile-title">{{ tile.title }}</span>
        <span class="tile-year">{{ tile.year }}</span>
      </button>
    </li>
  </ul>

  <v-dialog v-model="dialogOpen" max-width="720" scrollable>
    <v-card v-if="selected" class="tile-dialog">
      <v-card-title class="d-flex justify-space-between align-center ga-2">
        <span class="tile-dialog-title">{{ selected.title }}</span>
        <v-btn icon="mdi-close" variant="text" aria-label="Close" @click="dialogOpen = false" />
      </v-card-title>
      <v-card-text>
        <p class="tile-dialog-year">{{ selected.year }}</p>
        <p v-for="(paragraph, i) in selected.body" :key="i" class="tile-dialog-body">{{ paragraph }}</p>
        <p v-if="selected.links.length" class="tile-dialog-links">
          <a
            v-for="link in selected.links"
            :key="link.href"
            :href="link.href"
            :target="isExternal(link.href) ? '_blank' : undefined"
            :rel="isExternal(link.href) ? 'noopener' : undefined"
            >{{ link.label }}</a
          >
        </p>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.tile-grid {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--tile-size), 1fr));
  gap: 28px 24px;
  justify-items: center;
}

.tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: var(--tile-size);
  max-width: 100%;
  background: none;
  border: 0;
  padding: 0;
  color: inherit;
  cursor: pointer;
  text-align: center;
}

.tile-image {
  position: relative;
  display: block;
  width: 100%;
  border-radius: 50%;
}

.tile-image img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 50%;
}

/* Darker green than the original #6abb84 so white text passes WCAG AA. */
.tile-hover {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 18%;
  border-radius: 50%;
  background: rgba(36, 104, 62, 0.94);
  color: #fff;
  font-size: 0.95rem;
  line-height: 1.3;
  opacity: 0;
  transition: opacity 0.25s ease;
}

.tile:hover .tile-hover,
.tile:focus-visible .tile-hover {
  opacity: 1;
}

.tile:focus-visible {
  outline: none;
}

.tile:focus-visible .tile-image {
  outline: 3px solid #fbbf24;
  outline-offset: 4px;
}

.tile-title {
  margin-top: 12px;
  font-weight: 700;
  font-size: 0.95rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #e2e8f0;
}

.tile-year {
  font-size: 0.8rem;
  letter-spacing: 0.12em;
  color: #94a3b8;
}

/* Dialog: the original light-gray popup, with text dark enough for AA contrast. */
.tile-dialog {
  background-color: #dedede !important;
  color: #2b2d31 !important;
}

.tile-dialog-title {
  font-weight: 700;
  font-size: 1.1rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #3a3c40;
  white-space: normal;
}

.tile-dialog :deep(.v-btn) {
  color: #3a3c40;
}

.tile-dialog-year {
  font-size: 0.8rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #55585d;
  margin-bottom: 12px;
}

.tile-dialog-body {
  font-size: 1rem;
  line-height: 1.7;
  margin-bottom: 1em;
}

.tile-dialog-links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
}

.tile-dialog-links a {
  color: #1d6b3c;
  font-weight: 600;
  text-decoration: underline;
}
</style>
