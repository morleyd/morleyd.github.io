<script setup lang="ts">
import { useDisplay } from 'vuetify';
import { timeline } from '@/data/portfolio';

// Desktop: entries alternate sides of the line, with each date on the opposite
// side from its card. Phones: one column, date inside the card.
const { mdAndUp } = useDisplay();
</script>

<template>
  <section aria-labelledby="timeline-title" class="py-8">
    <h2 id="timeline-title" class="page-title mb-4">Timeline</h2>
    <v-timeline
      :side="mdAndUp ? undefined : 'end'"
      align="start"
      :density="mdAndUp ? 'default' : 'compact'"
      dot-color="purple-lighten-1"
      truncate-line="both"
      :class="{ alternating: mdAndUp }"
    >
      <v-timeline-item v-for="(entry, i) in timeline" :key="entry.when + entry.title" size="small">
        <template v-if="mdAndUp" #opposite>
          <span class="timeline-when opposite-when">{{ entry.when }}</span>
        </template>
        <div class="timeline-entry" :class="mdAndUp && i % 2 === 1 ? 'tail-right' : 'tail-left'">
          <span v-if="!mdAndUp" class="timeline-when">{{ entry.when }}</span>
          <div class="timeline-title">{{ entry.title }}</div>
          <p v-if="entry.text" class="timeline-text">{{ entry.text }}</p>
        </div>
      </v-timeline-item>
    </v-timeline>
  </section>
</template>

<style scoped>
/* Each event is its own small card (same surface as the featured cards), so the
   date, title and text read as one unit. */
.timeline-entry {
  /* Same width for every card. Vuetify's timeline body sizes to its content,
     so cap against the viewport (page gutters + dot column), not the parent. */
  width: min(62ch, calc(100vw - 96px));
  margin-bottom: 4px;
  padding: 10px 16px 12px;
  line-height: 1.4;
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  position: relative;
}

/* Two columns on desktop: each card gets half the content width. */
.alternating .timeline-entry {
  width: min(440px, calc(50vw - 100px));
}

/* Speech-bubble tail aimed at the timeline dot, centered 15px below the card's
   top (the dot's center). Two CSS triangles: ::before is the outline color,
   ::after sits 1px inside it in the card color and overlaps the card's
   border, so the tail and card read as one shape. */
.timeline-entry::before,
.timeline-entry::after {
  content: '';
  position: absolute;
  width: 0;
  height: 0;
  border-style: solid;
}

.timeline-entry::before {
  top: 7px;
  border-width: 8px 20px;
}

.timeline-entry::after {
  top: 8px;
  border-width: 7px 19px;
}

/* Card to the right of the line: tail points left. */
.tail-left::before {
  left: -20px;
  border-left-width: 0;
  border-color: transparent rgba(148, 163, 184, 0.18) transparent transparent;
}

.tail-left::after {
  left: -18px;
  border-left-width: 0;
  border-color: transparent rgb(var(--v-theme-surface)) transparent transparent;
}

/* Card to the left of the line: tail points right. */
.tail-right::before {
  right: -20px;
  border-right-width: 0;
  border-color: transparent transparent transparent rgba(148, 163, 184, 0.18);
}

.tail-right::after {
  right: -18px;
  border-right-width: 0;
  border-color: transparent transparent transparent rgb(var(--v-theme-surface));
}

.timeline-when {
  display: block;
  font-size: 0.8rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #fbbf24;
}

/* Desktop: the date sits across the line from its card, level with the dot. */
.opposite-when {
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.9;
  white-space: nowrap;
}

.timeline-title {
  margin-top: 2px;
  font-size: 1.05rem;
  font-weight: 700;
}

.alternating .timeline-title {
  margin-top: 0;
}

.timeline-text {
  margin: 2px 0 0;
  color: #cbd5e1;
}
</style>
