<script setup lang="ts">
import { sideProjects } from '@/data/portfolio';

const shown = sideProjects.filter((p) => p.live);
const isExternal = (href: string) => /^https?:/.test(href);
</script>

<template>
  <section aria-labelledby="side-title" class="py-8">
    <h2 id="side-title" class="page-title mb-6">Built on my own time</h2>
    <v-row>
      <v-col v-for="project in shown" :key="project.id" cols="12" md="6">
        <v-card class="h-100 pa-5" color="surface" elevation="6" rounded="lg">
          <h3 class="side-title">
            <v-icon :icon="project.icon" size="small" class="mr-1" />
            {{ project.title }}
          </h3>
          <p class="side-text">{{ project.description }}</p>
          <div class="d-flex flex-wrap ga-2 mt-4">
            <v-btn
              v-for="link in project.links"
              :key="link.href"
              v-bind="isExternal(link.href) ? { href: link.href, target: '_blank', rel: 'noopener' } : { to: link.href }"
              color="primary"
              variant="flat"
            >
              {{ link.label }}
            </v-btn>
          </div>
        </v-card>
      </v-col>
      <v-col cols="12" md="6" class="d-flex align-center">
        <v-btn :to="{ name: 'games' }" variant="outlined" color="secondary" append-icon="mdi-arrow-right"> All games </v-btn>
      </v-col>
    </v-row>
  </section>
</template>

<style scoped>
.side-title {
  font-size: 1.2rem;
  font-weight: 700;
}

.side-text {
  margin-top: 8px;
  line-height: 1.55;
  color: #e2e8f0;
}
</style>
