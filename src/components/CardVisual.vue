<script setup lang="ts">
import { computed } from 'vue';
import type { CardVisual } from '@/data/portfolio';

// The picture on a Home featured card. It sits inside the card's link, so it's
// hidden from screen readers: the card's title and summary carry the meaning.
// Gold marks what my models produce (the site's "what I built" color).
const props = defineProps<{ visual: CardVisual }>();

const barMax = computed(() =>
  props.visual.kind === 'metric' ? Math.max(props.visual.before.value, props.visual.after.value) : 1
);
</script>

<template>
  <div class="card-visual" aria-hidden="true">
    <template v-if="visual.kind === 'transcript'">
      <div class="tag">Speech recognition</div>
      <p class="mono asr">{{ visual.input }}</p>
      <div class="down">↓</div>
      <div class="tag">Coded by my models</div>
      <p v-for="(line, i) in visual.lines" :key="i" class="mono coded">
        <span v-for="(tok, j) in line" :key="j" :class="tok.kind">{{ tok.text }}</span>
      </p>
      <div class="caption">{{ visual.caption }}</div>
    </template>

    <template v-else-if="visual.kind === 'metric'">
      <div class="tag">{{ visual.label }}</div>
      <div class="bar-row">
        <div class="bar before" :style="{ width: `${(visual.before.value / barMax) * 100}%` }" />
        <span class="bar-text">{{ visual.before.text }}</span>
      </div>
      <div class="bar-row">
        <div class="bar after" :style="{ width: `${(visual.after.value / barMax) * 100}%` }" />
        <span class="bar-text gold">{{ visual.after.text }}</span>
      </div>
      <div class="bar-legend">
        <span>{{ visual.legend?.[0] ?? 'before' }}</span><span class="gold">{{ visual.legend?.[1] ?? 'after' }}</span>
      </div>
      <template v-if="visual.extra">
        <div class="tag mt">{{ visual.extra.label }}</div>
        <div class="big gold">{{ visual.extra.text }}</div>
      </template>
    </template>

    <template v-else-if="visual.kind === 'phonemes'">
      <div class="word">“{{ visual.word }}”</div>
      <div class="phones">
        <div v-for="(p, i) in visual.phones" :key="i" class="phone" :class="{ flagged: p.heard }">
          <span class="ipa">{{ p.ipa }}</span>
          <span v-if="p.heard" class="heard">[{{ p.heard }}]</span>
        </div>
      </div>
      <div class="caption">{{ visual.caption }}</div>
    </template>

    <template v-else-if="visual.kind === 'shorthand'">
      <div v-for="pair in visual.pairs" :key="pair.logged" class="pair">
        <span class="spoken">“{{ pair.spoken }}”</span>
        <span class="arrow">→</span>
        <span class="logged mono">{{ pair.logged }}</span>
      </div>
      <div class="caption">{{ visual.caption }}</div>
    </template>
  </div>
</template>

<style scoped>
.card-visual {
  border: 1.5px solid rgba(106, 187, 132, 0.6);
  border-radius: 8px;
  background: rgba(106, 187, 132, 0.06);
  padding: 12px;
  color: #e2e8f0;
  font-size: 0.8rem;
  line-height: 1.4;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.gold {
  color: #fbbf24;
}

.tag {
  font-size: 0.68rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #94a3b8;
  margin-bottom: 4px;
}

.mt {
  margin-top: 14px;
}

.caption {
  margin-top: 10px;
  font-size: 0.7rem;
  font-style: italic;
  color: #94a3b8;
}

/* Transcript */
.asr {
  color: #cbd5e1;
}

.down {
  color: #6abb84;
  text-align: center;
  margin: 2px 0;
}

.coded + .coded {
  margin-top: 4px;
}

.speaker {
  color: #94a3b8;
}

.maze {
  color: #c084fc;
}

.code {
  color: #fbbf24;
}

/* Metric */
.bar-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}

.bar {
  height: 14px;
  border-radius: 3px;
  max-width: calc(100% - 48px);
  flex: 0 0 auto;
}

.bar.before {
  background: rgba(148, 163, 184, 0.45);
}

.bar.after {
  background: #fbbf24;
}

.bar-text {
  font-weight: 600;
  white-space: nowrap;
}

.bar-legend {
  display: flex;
  gap: 12px;
  margin-top: 4px;
  font-size: 0.68rem;
  color: #94a3b8;
}

.big {
  font-size: 1.6rem;
  font-weight: 700;
  line-height: 1.1;
}

/* Phonemes */
.word {
  font-size: 1.05rem;
  font-weight: 600;
  margin-bottom: 8px;
}

.phones {
  display: flex;
  gap: 4px;
}

.phone {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 28px;
  padding: 6px 2px;
  border: 1.5px solid rgba(106, 187, 132, 0.6);
  border-radius: 5px;
}

.phone.flagged {
  border-color: #fbbf24;
  background: rgba(251, 191, 36, 0.12);
}

.ipa {
  font-size: 1.2rem;
}

.heard {
  font-size: 0.72rem;
  color: #fbbf24;
}

/* Shorthand */
.pair {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
}

.pair + .pair {
  margin-top: 10px;
}

.spoken {
  color: #cbd5e1;
}

.arrow {
  color: #6abb84;
}

.logged {
  color: #fbbf24;
  font-weight: 700;
  border: 1.5px solid #fbbf24;
  border-radius: 4px;
  padding: 0 6px;
}
</style>
