<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { artworkPieces, thumbUrl, fullUrl } from '@/data/artwork'

const activeIndex = ref(-1)
const isOpen = computed(() => activeIndex.value >= 0)
const activePiece = computed(() => (isOpen.value ? artworkPieces[activeIndex.value] : null))

const gridRef = ref<HTMLElement | null>(null)
const cardRef = ref<HTMLElement | null>(null)
const scrimRef = ref<HTMLElement | null>(null)

const DURATION = 340
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)'

const thumbRect = (index: number): DOMRect | null => {
  const items = gridRef.value?.querySelectorAll<HTMLElement>('.art-item')
  const el = items?.[index]
  return el ? el.getBoundingClientRect() : null
}

// FLIP: animate the lightbox card between the thumbnail's rect and its final rect.
const animateCard = (rect: DOMRect | null, direction: 'in' | 'out'): Animation | null => {
  const el = cardRef.value
  if (!el) return null
  const last = el.getBoundingClientRect()
  if (!rect || !last.width || !last.height) {
    return el.animate(
      direction === 'in'
        ? [{ opacity: 0, transform: 'scale(0.92)' }, { opacity: 1, transform: 'none' }]
        : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.92)' }],
      { duration: 200, easing: 'ease' },
    )
  }
  const dx = rect.left + rect.width / 2 - (last.left + last.width / 2)
  const dy = rect.top + rect.height / 2 - (last.top + last.height / 2)
  const sx = rect.width / last.width
  const sy = rect.height / last.height
  const fromTransform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`
  const frames =
    direction === 'in'
      ? [
          { transform: fromTransform, opacity: 0.35 },
          { transform: 'none', opacity: 1 },
        ]
      : [
          { transform: 'none', opacity: 1 },
          { transform: fromTransform, opacity: 0.15 },
        ]
  return el.animate(frames, { duration: DURATION, easing: EASE })
}

const fadeScrim = (direction: 'in' | 'out') => {
  scrimRef.value?.animate(
    direction === 'in' ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }],
    { duration: direction === 'in' ? DURATION : 200, easing: 'ease' },
  )
}

const open = async (index: number) => {
  const from = thumbRect(index)
  activeIndex.value = index
  await nextTick()
  animateCard(from, 'in')
  fadeScrim('in')
}

const close = () => {
  const from = thumbRect(activeIndex.value)
  fadeScrim('out')
  const anim = animateCard(from, 'out')
  if (anim) {
    anim.onfinish = () => {
      activeIndex.value = -1
    }
  } else {
    activeIndex.value = -1
  }
}

const prev = () => {
  activeIndex.value = (activeIndex.value - 1 + artworkPieces.length) % artworkPieces.length
}
const next = () => {
  activeIndex.value = (activeIndex.value + 1) % artworkPieces.length
}

const onKey = (event: KeyboardEvent) => {
  if (!isOpen.value) return
  if (event.key === 'ArrowLeft') prev()
  else if (event.key === 'ArrowRight') next()
  else if (event.key === 'Escape') close()
}

// Lock background scroll while the lightbox is open
watch(isOpen, (openNow) => {
  document.body.style.overflow = openNow ? 'hidden' : ''
})

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  document.body.style.overflow = ''
})
</script>

<template>
  <v-container class="py-6" max-width="1100">
    <div class="mb-6">
      <h1 class="page-title">My Artwork</h1>
      <p class="text-body-1 text-medium-emphasis">A collection of my digital art and illustrations.</p>
    </div>

    <div ref="gridRef" class="art-grid">
      <button
        v-for="(piece, index) in artworkPieces"
        :key="piece.file"
        type="button"
        class="art-item"
        @click="open(index)"
      >
        <img :src="thumbUrl(piece.file)" :alt="piece.title" loading="lazy" />
        <span class="art-title">{{ piece.title }}</span>
      </button>
    </div>

    <!-- Custom lightbox that expands from the clicked thumbnail -->
    <Teleport to="body">
      <div v-if="isOpen && activePiece" class="lb-root">
        <div ref="scrimRef" class="lb-scrim" @click="close"></div>
        <div ref="cardRef" class="lb-card" role="dialog" aria-modal="true">
          <div class="lb-head">
            <span class="lb-title">{{ activePiece.title }}</span>
            <v-btn icon="mdi-close" variant="text" size="small" @click="close" />
          </div>
          <div class="lb-imgwrap">
            <Transition name="lb-fade" mode="out-in">
              <img
                :key="activePiece.file"
                :src="fullUrl(activePiece.file)"
                :alt="activePiece.title"
                class="lb-img"
              />
            </Transition>
          </div>
          <div class="lb-nav">
            <v-btn variant="text" prepend-icon="mdi-chevron-left" @click="prev">Prev</v-btn>
            <v-btn variant="text" append-icon="mdi-chevron-right" @click="next">Next</v-btn>
          </div>
        </div>
      </div>
    </Teleport>
  </v-container>
</template>

<style scoped>
.art-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}

@media (max-width: 900px) {
  .art-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 480px) {
  .art-grid {
    grid-template-columns: 1fr;
  }
}

.art-item {
  position: relative;
  aspect-ratio: 1 / 1;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  border-radius: 12px;
  overflow: hidden;
}

.art-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.3s ease;
}

.art-item:hover img,
.art-item:focus-visible img {
  transform: scale(1.05);
}

.art-title {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 22px 12px 10px;
  text-align: left;
  color: #fff;
  font-weight: 600;
  background: linear-gradient(to top, rgba(2, 6, 23, 0.9), transparent);
  opacity: 0;
  transform: translateY(8px);
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.art-item:hover .art-title,
.art-item:focus-visible .art-title {
  opacity: 1;
  transform: translateY(0);
}

/* Lightbox */
.lb-root {
  position: fixed;
  inset: 0;
  z-index: 2400;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.lb-scrim {
  position: absolute;
  inset: 0;
  background: rgba(2, 6, 23, 0.72);
  backdrop-filter: blur(6px);
}

.lb-card {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 900px;
  max-height: 92vh;
  overflow: hidden;
  border-radius: 10px;
  background: #0f172a;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.55);
  transform-origin: center center;
  will-change: transform, opacity;
}

.lb-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 8px 8px 16px;
}

.lb-title {
  font-weight: 600;
}

.lb-imgwrap {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #020617;
}

.lb-img {
  max-width: 100%;
  max-height: calc(92vh - 120px);
  object-fit: contain;
  display: block;
}

.lb-nav {
  display: flex;
  justify-content: space-between;
  padding: 8px;
}

.lb-fade-enter-active,
.lb-fade-leave-active {
  transition: opacity 0.18s ease;
}
.lb-fade-enter-from,
.lb-fade-leave-to {
  opacity: 0;
}
</style>
