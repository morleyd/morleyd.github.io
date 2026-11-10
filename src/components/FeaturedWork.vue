<script setup lang="ts">
import { featured } from '@/data/portfolio';
import CardVisual from '@/components/CardVisual.vue';
</script>

<template>
  <section aria-labelledby="featured-title" class="py-8">
    <h2 id="featured-title" class="page-title mb-6">Featured work</h2>
    <v-row>
      <v-col v-for="work in featured" :key="work.id" cols="12" md="6">
        <v-card
          :to="{ name: 'work', hash: `#${work.id}` }"
          class="featured-card h-100"
          color="surface"
          elevation="6"
          rounded="lg"
          data-testid="featured-card"
        >
          <div class="d-flex ga-5 pa-5">
            <CardVisual class="featured-diagram" :visual="work.card" />
            <div class="flex-grow-1">
              <h3 class="featured-title">{{ work.title }}</h3>
              <div class="d-flex flex-wrap align-center ga-2 mt-2">
                <v-chip size="small" color="secondary" variant="tonal" label>{{ work.role }}</v-chip>
                <span class="featured-years">{{ work.years }}</span>
              </div>
              <p class="featured-summary">{{ work.summary }}</p>
              <span class="featured-more">Read the case study <v-icon icon="mdi-arrow-right" size="small" /></span>
            </div>
          </div>
        </v-card>
      </v-col>
    </v-row>
  </section>
</template>

<style scoped>
.featured-diagram {
  flex: 0 0 190px;
  max-width: 190px;
  align-self: flex-start;
}

/* Phones: the card is the title and result line only. */
@media (max-width: 599px) {
  .featured-diagram {
    display: none;
  }
}

.featured-title {
  font-size: 1.2rem;
  font-weight: 700;
  line-height: 1.3;
}

.featured-years {
  font-size: 0.85rem;
  color: #94a3b8;
}

.featured-summary {
  margin-top: 12px;
  line-height: 1.55;
  color: #e2e8f0;
}

.featured-more {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 12px;
  font-weight: 600;
  color: #c084fc;
}

.featured-card:focus-visible {
  outline: 3px solid #fbbf24;
  outline-offset: 2px;
}
</style>
