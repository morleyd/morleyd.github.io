/**
 * Tiny dependency-free confetti burst, shared by the games for win moments.
 * Draws on a temporary full-screen canvas overlay (pointer-events: none) and
 * removes itself when the last particle settles. Respects the user's
 * prefers-reduced-motion setting by doing nothing.
 */

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: string
  rot: number
  vrot: number
  shape: 0 | 1 // rect | circle
}

const COLORS = ['#f5c518', '#22d3ee', '#f472b6', '#34d399', '#a855f7', '#fb923c', '#60a5fa']

export interface ConfettiOptions {
  /** Number of particles (default 120). */
  count?: number
  /** 0..1 viewport coords of the burst origin (default center-top-ish). */
  x?: number
  y?: number
  /** Initial speed scale (default 1). */
  power?: number
}

let active = 0

/** Fire a celebratory confetti burst. Safe to call anywhere; no-ops in SSR/tests. */
export function burstConfetti(opts: ConfettiOptions = {}): void {
  if (typeof document === 'undefined' || typeof requestAnimationFrame === 'undefined') return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  if (active >= 3) return // don't stack unbounded overlays

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  active += 1

  const dpr = window.devicePixelRatio || 1
  const W = window.innerWidth
  const H = window.innerHeight
  canvas.width = W * dpr
  canvas.height = H * dpr
  canvas.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999'
  document.body.appendChild(canvas)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  const count = opts.count ?? 120
  const power = opts.power ?? 1
  const ox = (opts.x ?? 0.5) * W
  const oy = (opts.y ?? 0.35) * H
  const parts: Particle[] = Array.from({ length: count }, () => {
    const ang = Math.random() * Math.PI * 2
    const spd = (4 + Math.random() * 9) * power
    return {
      x: ox,
      y: oy,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd - 6 * power,
      size: 4 + Math.random() * 5,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rot: Math.random() * Math.PI,
      vrot: (Math.random() - 0.5) * 0.4,
      shape: Math.random() < 0.7 ? 0 : 1,
    }
  })

  let last = performance.now()
  const tick = (now: number) => {
    const dt = Math.min(48, now - last) / 16.7 // normalized to ~60fps steps
    last = now
    ctx.clearRect(0, 0, W, H)
    let alive = 0
    for (const p of parts) {
      p.vy += 0.28 * dt
      p.vx *= 0.99
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.rot += p.vrot * dt
      if (p.y > H + 20) continue
      alive += 1
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.fillStyle = p.color
      if (p.shape === 0) ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
      else {
        ctx.beginPath()
        ctx.arc(0, 0, p.size / 2.4, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }
    if (alive > 0) requestAnimationFrame(tick)
    else {
      canvas.remove()
      active -= 1
    }
  }
  requestAnimationFrame(tick)
}
