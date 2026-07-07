import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * Sizes a square game board to the actual visible viewport in JS — robust where
 * CSS vh/dvh misbehave on mobile (address bar). Returns a template ref to put on
 * the board wrapper and a pixel size to bind to its width/height.
 *
 * @param reserveBottom  space (px) used by anything BELOW the board (controls,
 *                       footer, page padding). Everything ABOVE is measured live.
 */
export function useSquareFit(reserveBottom = 80) {
  const el = ref<HTMLElement | null>(null)
  const px = ref(320)

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
    px.value = Math.max(140, Math.floor(Math.min(availW, availH)))
  }

  const onResize = () => recompute()
  const vv = window.visualViewport

  onMounted(() => {
    recompute()
    // Re-measure after layout/fonts settle and after the address bar animates.
    requestAnimationFrame(recompute)
    setTimeout(recompute, 150)
    setTimeout(recompute, 500)
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    window.addEventListener('orientationchange', () => setTimeout(recompute, 300))
    vv?.addEventListener('resize', onResize)
    vv?.addEventListener('scroll', onResize)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('resize', onResize)
    window.removeEventListener('orientationchange', onResize)
    vv?.removeEventListener('resize', onResize)
    vv?.removeEventListener('scroll', onResize)
  })

  return { el, px, recompute }
}
