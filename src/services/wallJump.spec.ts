import { describe, it, expect } from 'vitest'
import {
  CHARGE_PERIOD_MS,
  LAVA_MAX_SPEED,
  MAX_CHARGE_MS,
  MAX_JUMP_HEIGHT,
  MAX_JUMP_VY,
  MIN_JUMP_VY,
  SPIKE_WARMUP,
  WALL_X,
  chargeToVy,
  climbSpeed,
  hitsSpike,
  initialNinja,
  jump,
  lavaSpeed,
  predictTrajectory,
  spikeAt,
  spikeDifficulty,
  spikeHalfAt,
  spikePresenceProb,
  stepLava,
  stepNinja,
  type NinjaState,
} from './wallJump'

describe('chargeToVy oscillation', () => {
  it('starts at min power for an instant tap', () => {
    expect(chargeToVy(0)).toBe(MIN_JUMP_VY)
  })

  it('reaches full power at the first (half-period) peak', () => {
    expect(chargeToVy(MAX_CHARGE_MS)).toBeCloseTo(MAX_JUMP_VY)
  })

  it('uses a comfortably slow, phone-friendly period (~1.2-1.5s per full cycle)', () => {
    // Long enough that a player can watch the meter and release on the power they
    // want; MAX_CHARGE_MS (full power) is exactly half of it.
    expect(CHARGE_PERIOD_MS).toBeGreaterThanOrEqual(1200)
    expect(CHARGE_PERIOD_MS).toBeLessThanOrEqual(1500)
    expect(MAX_CHARGE_MS).toBe(CHARGE_PERIOD_MS / 2)
  })

  it('sweeps min → max → min: back to min after a full period', () => {
    expect(chargeToVy(CHARGE_PERIOD_MS)).toBeCloseTo(MIN_JUMP_VY)
    expect(chargeToVy(MAX_CHARGE_MS / 2)).toBeCloseTo((MIN_JUMP_VY + MAX_JUMP_VY) / 2)
  })

  it('is periodic in CHARGE_PERIOD_MS', () => {
    for (const t of [50, 200, 375, 600, 830]) {
      expect(chargeToVy(t)).toBeCloseTo(chargeToVy(t + CHARGE_PERIOD_MS))
      expect(chargeToVy(t)).toBeCloseTo(chargeToVy(t + 3 * CHARGE_PERIOD_MS))
    }
  })

  it('reaches both extremes and never exceeds the bounds', () => {
    let seenMin = false
    let seenMax = false
    for (let t = 0; t <= 3 * CHARGE_PERIOD_MS; t += 5) {
      const v = chargeToVy(t)
      expect(v).toBeGreaterThanOrEqual(MIN_JUMP_VY - 1e-9)
      expect(v).toBeLessThanOrEqual(MAX_JUMP_VY + 1e-9)
      if (Math.abs(v - MIN_JUMP_VY) < 1e-6) seenMin = true
      if (Math.abs(v - MAX_JUMP_VY) < 1e-6) seenMax = true
    }
    expect(seenMin).toBe(true)
    expect(seenMax).toBe(true)
  })
})

describe('jump power scaling and bounds', () => {
  const apex = (holdMs: number): number => {
    let s = jump(initialNinja(), holdMs)
    let peak = s.y
    for (let i = 0; i < 200 && s.airborne; i += 1) {
      s = stepNinja(s, 16)
      peak = Math.max(peak, s.y)
    }
    return peak
  }

  it('gives a big difference between a tap and a full hold', () => {
    // A short tap barely rises; a full hold arcs well over a climb unit higher.
    expect(apex(MAX_CHARGE_MS) - apex(0)).toBeGreaterThan(1)
  })

  it('caps the apex at MAX_JUMP_HEIGHT even for an absurd hold', () => {
    const eps = 0.05
    expect(apex(MAX_CHARGE_MS)).toBeLessThanOrEqual(MAX_JUMP_HEIGHT + eps)
    expect(apex(999999)).toBeLessThanOrEqual(MAX_JUMP_HEIGHT + eps)
  })
})

describe('predictTrajectory', () => {
  it('is empty when already airborne', () => {
    expect(predictTrajectory({ ...initialNinja(), airborne: true }, 300)).toEqual([])
  })

  it('grows the arc with a longer hold', () => {
    const peak = (holdMs: number) => Math.max(...predictTrajectory(initialNinja(), holdMs).map((p) => p.y))
    expect(peak(MAX_CHARGE_MS)).toBeGreaterThan(peak(0))
  })

  it('never leaves the playfield: x within the walls, apex clamped', () => {
    // Even a huge charge must stay between the walls and under the height cap.
    const path = predictTrajectory(initialNinja(), 999999)
    for (const p of path) {
      expect(p.x).toBeGreaterThanOrEqual(WALL_X['-1'] - 1e-9)
      expect(p.x).toBeLessThanOrEqual(WALL_X['1'] + 1e-9)
      expect(p.y).toBeLessThanOrEqual(MAX_JUMP_HEIGHT + 0.05)
    }
    // Ends clinging to the opposite (right) wall.
    expect(path[path.length - 1].x).toBeCloseTo(WALL_X['1'])
  })
})

describe('lava', () => {
  it('accelerates: rises faster over time, clamped to a ceiling', () => {
    expect(lavaSpeed(5000)).toBeGreaterThan(lavaSpeed(0))
    expect(lavaSpeed(1_000_000)).toBeCloseTo(LAVA_MAX_SPEED)
  })

  it('stepLava climbs more in a later frame than an early one', () => {
    const early = stepLava(0, 0, 100) // first 100ms
    const late = stepLava(0, 8000, 100) // 100ms, 8s into the run
    expect(late).toBeGreaterThan(early)
  })

  it('is outrunnable: even its accelerated maximum stays below the climb rate', () => {
    const climb = climbSpeed()
    expect(climb).toBeGreaterThan(0)
    // The fully accelerated ceiling must sit comfortably under a skilled climb.
    expect(LAVA_MAX_SPEED).toBeLessThan(climb)
    expect(LAVA_MAX_SPEED).toBeLessThanOrEqual(0.7 * climb)
    // The starting speed is of course slower still.
    expect(lavaSpeed(0)).toBeLessThan(LAVA_MAX_SPEED)
  })
})

describe('jump', () => {
  it('launches toward the opposite wall and goes airborne', () => {
    const j = jump(initialNinja(), MAX_CHARGE_MS) // on left wall
    expect(j.airborne).toBe(true)
    expect(j.vx).toBeGreaterThan(0) // moving right, away from the left wall
    expect(j.vy).toBe(MAX_JUMP_VY)
  })
  it('is a no-op while already airborne', () => {
    const air: NinjaState = { ...initialNinja(), airborne: true }
    expect(jump(air, 200)).toBe(air)
  })
})

describe('stepNinja', () => {
  it('does nothing while grounded', () => {
    const g = initialNinja()
    expect(stepNinja(g, 16)).toBe(g)
  })
  it('applies gravity to vertical velocity while airborne', () => {
    const air = jump(initialNinja(), MAX_CHARGE_MS)
    const next = stepNinja(air, 16)
    expect(next.vy).toBeLessThan(air.vy)
  })
  it('clings to the opposite wall on arrival, flipping side and grounding', () => {
    let s = jump(initialNinja(), MAX_CHARGE_MS) // from left → flying right
    for (let i = 0; i < 200 && s.airborne; i += 1) s = stepNinja(s, 16)
    expect(s.airborne).toBe(false)
    expect(s.side).toBe(1)
    expect(s.x).toBeCloseTo(WALL_X['1'])
  })
})

describe('spikeAt', () => {
  it('is deterministic and picks a single wall', () => {
    const a = spikeAt(77, 30)
    expect(spikeAt(77, 30)).toEqual(a)
    expect([-1, 1]).toContain(a.side)
    expect(a.y).toBeGreaterThan(0)
  })
  it('leaves a spike-free warm-up at the bottom', () => {
    // Row 0 sits at the warm-up line (± small jitter); nothing appears below it.
    expect(spikeAt(1, 0).y).toBeGreaterThan(SPIKE_WARMUP - 0.5)
  })
})

describe('spike difficulty ramps with height', () => {
  it('difficulty rises from 0 at the warm-up to 1 higher up, and clamps', () => {
    expect(spikeDifficulty(0)).toBe(0)
    expect(spikeDifficulty(SPIKE_WARMUP)).toBe(0)
    expect(spikeDifficulty(SPIKE_WARMUP + 10)).toBeGreaterThan(0)
    expect(spikeDifficulty(SPIKE_WARMUP + 10)).toBeLessThan(1)
    expect(spikeDifficulty(10_000)).toBe(1)
  })
  it('presence probability and spike size both grow with height', () => {
    expect(spikePresenceProb(60)).toBeGreaterThan(spikePresenceProb(SPIKE_WARMUP))
    expect(spikeHalfAt(60)).toBeGreaterThan(spikeHalfAt(SPIKE_WARMUP))
  })
  it('the start is forgiving: far denser near the top than near the bottom', () => {
    const seed = 12345
    const countPresent = (from: number, to: number) => {
      let n = 0
      for (let i = from; i < to; i += 1) if (spikeAt(seed, i).present) n += 1
      return n
    }
    const low = countPresent(0, 20) // roughly the first ~25 climb units
    const high = countPresent(60, 80) // deep into the ramp
    expect(high).toBeGreaterThan(low)
    // And near the very top essentially every row is a spike.
    expect(countPresent(200, 220)).toBeGreaterThan(18)
  })
})

describe('hitsSpike', () => {
  // Use a high row (difficulty ≈ 1) so a spike is guaranteed present.
  const presentSpike = (seed: number) => spikeAt(seed, 30)

  it('impales a ninja clinging at a spike on the same wall', () => {
    const seed = 5
    const spike = presentSpike(seed)
    expect(spike.present).toBe(true)
    const s: NinjaState = { side: spike.side, x: WALL_X[spike.side], y: spike.y, vx: 0, vy: 0, airborne: false }
    expect(hitsSpike(s, seed)).toBe(true)
  })
  it('is safe on the opposite wall from the spike', () => {
    const seed = 5
    const spike = presentSpike(seed)
    const other = (spike.side * -1) as -1 | 1
    const s: NinjaState = { side: other, x: WALL_X[other], y: spike.y, vx: 0, vy: 0, airborne: false }
    expect(hitsSpike(s, seed)).toBe(false)
  })
  it('is safe airborne out in the middle of the shaft', () => {
    const seed = 5
    const spike = presentSpike(seed)
    const s: NinjaState = { side: spike.side, x: 0.5, y: spike.y, vx: 0.9, vy: 0, airborne: true }
    expect(hitsSpike(s, seed)).toBe(false)
  })
  it('kills the ninja that flies into a spike near its wall', () => {
    const seed = 5
    const spike = presentSpike(seed)
    // Airborne, pressed against the spike's wall and moving toward it (arriving),
    // so it is genuinely flying into the spike.
    const s: NinjaState = {
      side: spike.side,
      x: WALL_X[spike.side],
      y: spike.y,
      vx: spike.side * 0.9,
      vy: 0,
      airborne: true,
    }
    expect(hitsSpike(s, seed)).toBe(true)
  })
  it('is safe at the start (no spike near y=0)', () => {
    expect(hitsSpike(initialNinja(), 5)).toBe(false)
  })
})

describe('hitsSpike — the launch wall cannot kill you', () => {
  const presentSpike = (seed: number) => spikeAt(seed, 30)

  it('does not die rising off the wall it just launched from, past a same-side spike', () => {
    const seed = 5
    const spike = presentSpike(seed)
    expect(spike.present).toBe(true)
    // Ninja launched off `spike.side`, so it is still against that wall but
    // already airborne and moving AWAY toward the far wall (vx = -side * speed),
    // rising past its own wall's spike. This must not be fatal.
    const launched: NinjaState = {
      side: spike.side,
      x: WALL_X[spike.side],
      y: spike.y,
      vx: -spike.side * 0.9,
      vy: 1.0,
      airborne: true,
    }
    expect(hitsSpike(launched, seed)).toBe(false)
  })

  it('a real leap: launching next to a same-side spike and stepping upward stays alive', () => {
    const seed = 5
    const spike = presentSpike(seed)
    // Sit the ninja on the spike's wall, right at the spike's height, and leap.
    let s: NinjaState = { side: spike.side, x: WALL_X[spike.side], y: spike.y, vx: 0, vy: 0, airborne: false }
    s = jump(s, MAX_CHARGE_MS)
    // Simulate the departure/ascent: while still near the launch wall it is safe.
    let diedOnAscent = false
    for (let i = 0; i < 6 && s.airborne; i += 1) {
      if (hitsSpike(s, seed)) diedOnAscent = true
      s = stepNinja(s, 16)
    }
    expect(diedOnAscent).toBe(false)
  })

  it('still dies when it reaches the destination wall onto a spike there', () => {
    // Find a seed whose row-30 spike sits on the right wall, then launch from the
    // left toward it and confirm arriving on it is fatal.
    let seed = 1
    while (spikeAt(seed, 30).side !== 1) seed += 1
    const spike = spikeAt(seed, 30)
    expect(spike.present).toBe(true)
    // Airborne, arriving at the destination (right) wall right at the spike.
    const arriving: NinjaState = {
      side: -1, // launched from the left
      x: WALL_X['1'],
      y: spike.y,
      vx: 0.9, // moving right, into the destination wall
      vy: 0,
      airborne: true,
    }
    expect(hitsSpike(arriving, seed)).toBe(true)
  })

  it('landing (grounded) on a spike is still fatal', () => {
    const seed = 5
    const spike = presentSpike(seed)
    const landed: NinjaState = { side: spike.side, x: WALL_X[spike.side], y: spike.y, vx: 0, vy: 0, airborne: false }
    expect(hitsSpike(landed, seed)).toBe(true)
  })
})
