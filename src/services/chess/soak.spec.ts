/**
 * Self-play soak: play many full games through the SAME code paths the view
 * uses (taps, offers, resists, coax, enemy chaos plan/commit, spontaneous
 * stunts, suggestions), verifying invariants every ply and collecting stats +
 * anomalies. Temporary tool — findings drive polish.
 */
import { describe, it } from 'vitest'

// Run explicitly with:  SOAK=1 npx vitest run src/services/chess/_sim.spec.ts
// (plays full engine games — ~15+ minutes; never part of a normal test pass)
const soak = process.env.SOAK ? describe : describe.skip
import { WizardGame, PLAYER } from './game'
import { chooseMove } from './search'
import type { Square } from './types'

const GAMES = 50
const MAX_PLIES = 300

interface Note {
  seed: string
  ply: number
  what: string
}

soak('self-play soak', () => {
  it(
    `plays ${GAMES} games and reports`,
    () => {
      const notes: Note[] = []
      const stats = {
        results: { mateWin: 0, mateLoss: 0, draw: 0, unfinished: 0 },
        plies: [] as number[],
        stunts: {} as Record<string, number>,
        offers: 0,
        offersTaken: 0,
        resists: 0,
        coaxes: 0,
        utterances: 0,
        trustEnd: [] as number[],
        trustMin: [] as number[],
        trustMax: [] as number[],
        repeatedLines: 0,
      }
      const stunt = (k: string) => (stats.stunts[k] = (stats.stunts[k] ?? 0) + 1)

      for (let gi = 0; gi < GAMES; gi += 1) {
        const seed = `soak-${gi}`
        const g = new WizardGame(seed)
        g.settings = { chatter: 0.6, animation: 0.6, agency: 0.6, chaos: 0.5 }
        const rng = (() => {
          let s = gi * 2654435761 + 1
          return () => {
            s = (s * 1103515245 + 12345) % 2147483648
            return s / 2147483648
          }
        })()
        const lines: string[] = []
        const say = (us: { text: string }[]) => {
          for (const u of us) {
            stats.utterances += 1
            if (lines.includes(u.text)) stats.repeatedLines += 1
            lines.push(u.text)
          }
        }
        say(g.pregameChatter())
        let tMin = g.trust
        let tMax = g.trust
        let lastFxSeq = -1
        let ply = 0

        const invariants = (where: string) => {
          // board <-> society mapping agrees
          for (const [sq, id] of Object.entries(g.society.bySquare)) {
            const p = g.chess.get(sq as Square)
            const s = g.society.souls[id]
            if (!p) notes.push({ seed, ply, what: `${where}: soul ${id} on empty ${sq}` })
            else if (!s) notes.push({ seed, ply, what: `${where}: unknown soul ${id} at ${sq}` })
            else {
              if (p.type !== s.type) notes.push({ seed, ply, what: `${where}: type mismatch at ${sq} (${p.type} vs ${s.type})` })
              if (p.color !== s.color) notes.push({ seed, ply, what: `${where}: color mismatch at ${sq}` })
              if (s.square !== sq) notes.push({ seed, ply, what: `${where}: soul.square ${s.square} != ${sq}` })
              if (s.captured) notes.push({ seed, ply, what: `${where}: captured soul still mapped at ${sq}` })
            }
          }
          let boardCount = 0
          for (const row of g.chess.board()) for (const c of row) if (c) boardCount += 1
          const mapped = Object.keys(g.society.bySquare).length
          if (boardCount !== mapped) notes.push({ seed, ply, what: `${where}: board ${boardCount} pieces vs ${mapped} mapped` })
          if (g.trust < 0 || g.trust > 100) notes.push({ seed, ply, what: `${where}: trust out of range ${g.trust}` })
          const gy = new Set(g.graveyard)
          if (gy.size !== g.graveyard.length) notes.push({ seed, ply, what: `${where}: duplicate graveyard entries` })
          if (g.fx && g.fx.seq !== lastFxSeq) {
            lastFxSeq = g.fx.seq
            stunt(`fx:${g.fx.kind}`)
          }
        }

        for (ply = 0; ply < MAX_PLIES && !g.gameOver; ply += 1) {
          if (g.turn === PLAYER) {
            // occasionally a suggestion pre-selects a piece
            const sug = g.suggest()
            if (sug) say([sug])
            // coax a runaway home some of the time
            const wayward = g.waywardSoul()
            if (wayward && rng() < 0.5) {
              g.playerTap(wayward.square as Square)
              const home = g.coaxTarget()
              if (home) {
                const r = g.playerTap(home)
                say(r.utterances)
                stats.coaxes += 1
              }
            }
            let moved = false
            for (let attempt = 0; attempt < 10 && !moved; attempt += 1) {
              if (g.gameOver || g.turn !== PLAYER) break
              const legal = g.chess.moves({ verbose: true }) as unknown as { from: Square; to: Square }[]
              if (!legal.length) break
              const mv = legal[Math.floor(rng() * legal.length)]
              const best = chooseMove(g.chess.fen(), 2)
              const pick = best && rng() < 0.8 ? (best as { from: Square; to: Square }) : mv
              if (g.selected !== pick.from) {
                const sel = g.playerTap(pick.from)
                say(sel.utterances)
              }
              // an offer appeared: take it sometimes to exercise stunts
              const targets = g.chaosTargets()
              if (targets.length) {
                stats.offers += 1
                if (rng() < 0.45) {
                  const offerType = g.chaosOfferType()
                  const t = targets[Math.floor(rng() * targets.length)]
                  const r = g.playerTap(t)
                  say(r.utterances)
                  if (r.moved) {
                    stats.offersTaken += 1
                    stunt(`taken:${offerType ?? 'unknown'}`)
                    moved = true
                    continue
                  }
                }
              }
              for (let tap = 0; tap < 5 && !moved; tap += 1) {
                const r = g.playerTap(pick.to)
                say(r.utterances)
                if (r.cue) stats.resists += 1
                moved = r.moved
              }
            }
            if (!moved && !g.gameOver) {
              const legal = g.chess.moves()
              if (legal.length) notes.push({ seed, ply, what: `white could not move (${g.chess.fen()})` })
              break
            }
            invariants('after-white')
          } else {
            const plan = g.aiChaosPlan()
            if (plan) {
              say([plan.announce])
              const done = g.aiChaosCommit(plan)
              say(done)
              if (!done.length) {
                notes.push({ seed, ply, what: 'aiChaos plan died at commit' })
                const m = chooseMove(g.chess.fen(), 2)
                if (m) say(g.aiApply(m))
              }
            } else {
              const m = chooseMove(g.chess.fen(), 2)
              if (m) say(g.aiApply(m))
              else if (!g.gameOver) {
                notes.push({ seed, ply, what: `engine returned no move but game not over (${g.chess.fen()})` })
                break
              }
            }
            const sp = g.spontaneousChaos()
            if (sp) say([sp])
            invariants('after-black')
            if (!g.gameOver && g.turn !== PLAYER) {
              notes.push({ seed, ply, what: 'turn did not return to white' })
              break
            }
          }
          tMin = Math.min(tMin, g.trust)
          tMax = Math.max(tMax, g.trust)
        }

        if (g.gameOver) {
          if (g.chess.isCheckmate()) {
            if (g.turn !== PLAYER) stats.results.mateWin += 1
            else stats.results.mateLoss += 1
          } else stats.results.draw += 1
          say(g.postGame())
        } else stats.results.unfinished += 1
        stats.plies.push(ply)
        stats.trustEnd.push(Math.round(g.trust))
        stats.trustMin.push(Math.round(tMin))
        stats.trustMax.push(Math.round(tMax))
      }

      const avg = (a: number[]) => Math.round(a.reduce((x, y) => x + y, 0) / Math.max(1, a.length))
      console.log('=== SOAK RESULTS ===')
      console.log('results:', JSON.stringify(stats.results))
      console.log('plies avg:', avg(stats.plies), 'min:', Math.min(...stats.plies), 'max:', Math.max(...stats.plies))
      console.log('stunts:', JSON.stringify(stats.stunts))
      console.log('offers:', stats.offers, 'taken:', stats.offersTaken, 'resists:', stats.resists, 'coaxes:', stats.coaxes)
      console.log('utterances total:', stats.utterances, 'repeated:', stats.repeatedLines)
      console.log('trust end avg:', avg(stats.trustEnd), 'min-of-mins:', Math.min(...stats.trustMin), 'ends:', JSON.stringify(stats.trustEnd))
      console.log('NOTES (' + notes.length + '):')
      for (const n of notes.slice(0, 40)) console.log(` [${n.seed} ply ${n.ply}] ${n.what}`)
    },
    1_800_000,
  )
})
