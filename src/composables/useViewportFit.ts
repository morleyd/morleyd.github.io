import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * Sizes a non-square game board to the actual visible viewport in JS — the
 * rectangle sibling of {@link useSquareFit}, for tall/wide boards a square fit
 * would waste space on. Fits the largest rectangle of a fixed aspect ratio into
 * the space available below the board element, robust where CSS vh/dvh misbehave
 * on mobile (the address bar). Returns a template ref for the board wrapper plus
 * pixel width/height to bind to it.
 *
 * Height fills the available box unless the proportional width would overflow,
 * in which case width caps it (and height follows to keep the aspect).
 *
 * @param aspect        board width / height.
 * @param reserveBottom space (px) used by anything BELOW the board (controls,
 *                      footer, page padding). Everything ABOVE is measured live.
 */
export function useViewportFit(aspect: number, reserveBottom = 80) {
  const el = ref<HTMLElement | null>(null)
  const h = ref(320)
  const w = ref(Math.round(320 * aspect))

  const recompute = () => {
    const node = el.value
    const parent = node?.parentElement
    if (!node || !parent) return
    const cs = getComputedStyle(parent)
    const availW = parent.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
    const top = node.getBoundingClientRect().top
    // Take the SMALLEST of every viewport-height signal — different mobile
    // browsers report the visible area in different ones, so the min is safest.
    const viewportH = Math.min(
      window.visualViewport?.height ?? Infinity,
      window.innerHeight || Infinity,
      document.documentElement.clientHeight || Infinity,
    )
    const availH = viewportH - top - reserveBottom
    // Fill the height, but never let the proportional width overflow the parent.
    const height = Math.max(140, Math.floor(Math.min(availH, availW / aspect)))
    h.value = height
    w.value = Math.round(height * aspect)
  }

  const onResize = () => recompute()
  // Re-measure once more after the rotation settles (the address bar animates).
  const onOrient = () => setTimeout(recompute, 300)
  const vv = window.visualViewport

  onMounted(() => {
    recompute()
    // Re-measure after layout/fonts settle and after the address bar animates.
    requestAnimationFrame(recompute)
    setTimeout(recompute, 150)
    setTimeout(recompute, 500)
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    window.addEventListener('orientationchange', onOrient)
    vv?.addEventListener('resize', onResize)
    vv?.addEventListener('scroll', onResize)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('resize', onResize)
    window.removeEventListener('orientationchange', onResize)
    window.removeEventListener('orientationchange', onOrient)
    vv?.removeEventListener('resize', onResize)
    vv?.removeEventListener('scroll', onResize)
  })

  return { el, w, h, recompute }
}
