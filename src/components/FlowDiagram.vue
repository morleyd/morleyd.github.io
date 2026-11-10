<script setup lang="ts">
import { computed } from 'vue';
import type { DiagramStep } from '@/data/portfolio';

// A top-to-bottom flow of labeled boxes, drawn in the same green line-art
// style as the round project tiles. Text is the step labels only: no logos,
// screenshots or real data. Steps marked `mine` are drawn in gold. Pass an empty `alt` where the diagram sits inside a
// link, so it's hidden from screen readers instead of read twice.
const props = defineProps<{ steps: DiagramStep[]; alt: string }>();

const WIDTH = 180;
const BOX_H = 32;
const GAP = 16;

const boxes = computed(() => props.steps.map((step, i) => ({ ...step, y: 1 + i * (BOX_H + GAP) })));
const height = computed(() => props.steps.length * (BOX_H + GAP) - GAP + 2);
</script>

<template>
  <svg
    class="flow"
    :viewBox="`0 0 ${WIDTH} ${height}`"
    :role="alt ? 'img' : undefined"
    :aria-label="alt || undefined"
    :aria-hidden="alt ? undefined : 'true'"
    preserveAspectRatio="xMidYMin meet"
  >
    <g v-for="(box, i) in boxes" :key="box.label">
      <rect x="1" :y="box.y" :width="WIDTH - 2" :height="BOX_H" rx="8" :class="{ muted: box.muted, mine: box.mine }" />
      <text :x="WIDTH / 2" :y="box.y + BOX_H / 2" :class="{ muted: box.muted }">{{ box.label }}</text>
      <path v-if="i < boxes.length - 1" class="arrow" :d="`M ${WIDTH / 2} ${box.y + BOX_H + 2} v ${GAP - 8} m -4 -4 l 4 4 l 4 -4`" />
    </g>
  </svg>
</template>

<style scoped>
/* No `display` here: Vuetify 4's utility classes live in a CSS layer, so an
   unlayered display rule would override a parent's hide-on-phone class. */
.flow {
  width: 100%;
  max-width: 220px;
}

rect {
  fill: rgba(106, 187, 132, 0.08);
  stroke: #6abb84;
  stroke-width: 1.5;
}

rect.muted {
  fill: none;
  stroke: #94a3b8;
  stroke-dasharray: 4 3;
}

/* Steps I built: the site's gold accent. Muted + mine stays dashed (it's still
   a filter step), just gold. */
rect.mine {
  fill: rgba(251, 191, 36, 0.1);
  stroke: #fbbf24;
}

rect.mine.muted {
  fill: none;
}

text {
  fill: #e2e8f0;
  font-size: 13px;
  text-anchor: middle;
  dominant-baseline: central;
}

text.muted {
  fill: #cbd5e1;
  font-style: italic;
}

.arrow {
  fill: none;
  stroke: #6abb84;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
