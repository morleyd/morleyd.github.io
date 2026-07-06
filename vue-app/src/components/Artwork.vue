<script setup lang="ts">
import { artworkPieces, thumbUrl } from '@/data/artwork'

const preview = artworkPieces.slice(0, 6)
</script>

<template>
  <v-card flat class="bg-transparent pa-6 pa-md-12">
    <div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-4">
      <h2 class="page-title mb-0">My Artwork</h2>
      <v-btn :to="{ name: 'gallery' }" variant="text" color="primary" append-icon="mdi-arrow-right">
        View gallery
      </v-btn>
    </div>

    <div class="art-preview">
      <router-link
        v-for="piece in preview"
        :key="piece.file"
        :to="{ name: 'gallery' }"
        class="art-thumb"
        :aria-label="piece.title"
      >
        <img :src="thumbUrl(piece.file)" :alt="piece.title" loading="lazy" />
      </router-link>
    </div>
  </v-card>
</template>

<style scoped>
.art-preview {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 12px;
}

@media (max-width: 900px) {
  .art-preview {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 480px) {
  .art-preview {
    grid-template-columns: repeat(2, 1fr);
  }
}

.art-thumb {
  aspect-ratio: 1 / 1;
  border-radius: 10px;
  overflow: hidden;
  display: block;
}

.art-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}

.art-thumb:hover img {
  transform: scale(1.06);
}
</style>
