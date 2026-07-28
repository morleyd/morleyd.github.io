import { useViewportFit } from './useViewportFit'

/**
 * Sizes a square game board to the actual visible viewport — the aspect-1 case
 * of {@link useViewportFit}, kept as its own composable for the (many) square
 * games. Returns a template ref to put on the board wrapper and a pixel size to
 * bind to its width/height.
 *
 * @param reserveBottom  space (px) used by anything BELOW the board (controls,
 *                       footer, page padding). Everything ABOVE is measured live.
 */
export function useSquareFit(reserveBottom = 80) {
  const { el, w, recompute } = useViewportFit(1, reserveBottom)
  return { el, px: w, recompute }
}
