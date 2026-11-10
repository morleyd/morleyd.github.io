<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { alsoAtCobalt, archiveProjects, earlierProjects, featured, recognition } from '@/data/portfolio';
import FlowDiagram from '@/components/FlowDiagram.vue';
import TileGrid from '@/components/TileGrid.vue';

const router = useRouter();
const route = useRoute();

// Vue Router records the previous path in history.state.back. Only offer the
// back link when that was Home (a featured card), and go *back* rather than
// push '/', so Home restores its scroll position at the card they clicked.
// Re-read on every route change: /work → /work (the app-bar tab) reuses this
// component, and the entry it pushes no longer has Home behind it.
const cameFromHome = computed(() => route.fullPath !== '' && window.history.state?.back === '/');
</script>

<template>
  <v-container max-width="1100" class="px-4 px-md-8 py-8">
    <h1 class="page-title mb-2">Work</h1>
    <p class="work-intro">
      Four projects from my work at Cobalt Speech & Language, each as problem, my role, approach, result, and one thing I learned.
    </p>

    <article v-for="work in featured" :id="work.id" :key="work.id" class="case-study" data-testid="case-study" :aria-labelledby="`${work.id}-title`">
      <header class="mb-4">
        <a v-if="cameFromHome" href="/" class="back-link" data-testid="back-home" @click.prevent="router.back()">
          <v-icon icon="mdi-arrow-left" size="small" /> Back to home
        </a>
        <h2 :id="`${work.id}-title`" class="case-title">{{ work.title }}</h2>
        <div class="d-flex flex-wrap align-center ga-2 mt-2">
          <v-chip size="small" color="secondary" variant="tonal" label>{{ work.role }}</v-chip>
          <span class="case-years">{{ work.years }}</span>
        </div>
      </header>

      <div class="case-body">
        <div class="case-text">
          <h3>Problem</h3>
          <p>{{ work.problem }}</p>

          <h3>My role</h3>
          <p v-for="(line, i) in work.myRole" :key="i">{{ line }}</p>

          <h3>Approach</h3>
          <ul>
            <li v-for="(line, i) in work.approach" :key="i">{{ line }}</li>
          </ul>

          <h3>Result</h3>
          <p v-if="work.resultIntro">{{ work.resultIntro }}</p>
          <ul>
            <li v-for="(line, i) in work.result" :key="i">{{ line }}</li>
          </ul>

          <h3>One thing I learned</h3>
          <p>{{ work.lesson.intro }}</p>
          <ul v-if="work.lesson.bullets">
            <li v-for="(line, i) in work.lesson.bullets" :key="i">{{ line }}</li>
          </ul>
          <p v-if="work.lesson.outro">{{ work.lesson.outro }}</p>
        </div>
        <figure class="case-diagram">
          <FlowDiagram :steps="work.diagram" :alt="work.diagramAlt" />
          <figcaption class="diagram-key"><span class="key-swatch" aria-hidden="true" />What I built</figcaption>
        </figure>
      </div>
    </article>

    <section aria-labelledby="also-title" class="work-section">
      <h2 id="also-title" class="page-title mb-4">Also at Cobalt</h2>
      <ul class="also-list">
        <li v-for="(line, i) in alsoAtCobalt" :key="i">{{ line }}</li>
      </ul>
    </section>

    <section aria-labelledby="earlier-title" class="work-section">
      <h2 id="earlier-title" class="page-title mb-6">Earlier projects (2019–2021)</h2>
      <TileGrid :tiles="earlierProjects" />
    </section>

    <section aria-labelledby="archive-title" class="work-section">
      <h2 id="archive-title" class="page-title mb-4">Archive</h2>
      <v-expansion-panels variant="accordion" bg-color="surface">
        <v-expansion-panel title="More projects (2018–2022)">
          <v-expansion-panel-text>
            <TileGrid :tiles="archiveProjects" :size="180" class="py-4" />
          </v-expansion-panel-text>
        </v-expansion-panel>
        <v-expansion-panel title="Awards">
          <v-expansion-panel-text>
            <TileGrid :tiles="recognition" :size="180" class="py-4" />
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </section>
  </v-container>
</template>

<style scoped>
.work-intro {
  max-width: 62ch;
  color: #cbd5e1;
  margin-bottom: 16px;
}

.case-study {
  padding: 40px 0;
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
  /* Clear the fixed app bar when jumping to /work#id. */
  scroll-margin-top: 80px;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 8px;
  font-weight: 600;
  color: #c084fc;
  text-decoration: none;
}

.back-link:hover {
  text-decoration: underline;
}

.back-link:focus-visible {
  outline: 3px solid #fbbf24;
  outline-offset: 2px;
}

.diagram-key {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  font-size: 0.85rem;
  color: #cbd5e1;
}

.key-swatch {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  border: 1.5px solid #fbbf24;
  background: rgba(251, 191, 36, 0.1);
}

.case-title {
  font-size: 1.6rem;
  font-weight: 700;
  line-height: 1.25;
}

.case-years {
  font-size: 0.9rem;
  color: #94a3b8;
}

.case-body {
  display: flex;
  gap: 40px;
  align-items: flex-start;
}

.case-text {
  flex: 1 1 auto;
  min-width: 0;
  max-width: 70ch;
  line-height: 1.65;
  color: #e2e8f0;
}

.case-text h3 {
  margin: 20px 0 6px;
  font-size: 0.85rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #fbbf24;
}

.case-text h3:first-child {
  margin-top: 0;
}

.case-text p + p {
  margin-top: 8px;
}

.case-text ul,
.also-list {
  padding-left: 22px;
}

.case-text li + li,
.also-list li + li {
  margin-top: 6px;
}

.case-diagram {
  margin: 0;
  flex: 0 0 200px;
  position: sticky;
  top: 88px;
}

.work-section {
  padding-top: 48px;
}

.also-list {
  max-width: 70ch;
  line-height: 1.65;
  color: #e2e8f0;
}

@media (max-width: 800px) {
  .case-body {
    flex-direction: column-reverse;
    gap: 20px;
  }

  .case-diagram {
    position: static;
    flex-basis: auto;
    max-width: 200px;
  }
}
</style>
