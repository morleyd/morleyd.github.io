/**
 * Main-thread handle to the chess engine worker. One worker, request/response
 * matched by id. Falls back to a synchronous search if Workers are unavailable
 * (e.g. during SSR/tests), so callers always get a move.
 */
import { chooseMove } from './search'
import type { EngineMove } from './types'

interface Pending {
  resolve: (m: EngineMove | null) => void
  fen: string
  level: number
}

export class Engine {
  private worker: Worker | null = null
  private nextId = 1
  // The request's fen/level ride along so a worker crash can be answered with a
  // synchronous fallback search instead of leaving bestMove() pending forever.
  private pending = new Map<number, Pending>()

  constructor() {
    try {
      this.worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' })
      this.worker.onmessage = (e: MessageEvent<{ id: number; move: EngineMove | null }>) => {
        const p = this.pending.get(e.data.id)
        if (p) {
          this.pending.delete(e.data.id)
          p.resolve(e.data.move)
        }
      }
      // Worker died (module error, runtime throw). Answer every in-flight request
      // on the main thread and stop using the dead worker, so no turn hangs.
      this.worker.onerror = () => {
        this.worker = null
        for (const p of this.pending.values()) p.resolve(chooseMove(p.fen, p.level))
        this.pending.clear()
      }
    } catch {
      this.worker = null // main-thread fallback
    }
  }

  /** Best move for the side to move in `fen`, at difficulty `level` (1–6). */
  bestMove(fen: string, level: number): Promise<EngineMove | null> {
    if (!this.worker) return Promise.resolve(chooseMove(fen, level))
    const id = this.nextId++
    return new Promise((resolve) => {
      this.pending.set(id, { resolve, fen, level })
      this.worker!.postMessage({ id, fen, level })
    })
  }

  dispose() {
    this.worker?.terminate()
    this.worker = null
    // Settle anything still awaiting so no promise (and its caller) leaks.
    for (const p of this.pending.values()) p.resolve(null)
    this.pending.clear()
  }
}
