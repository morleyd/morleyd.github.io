/**
 * Main-thread handle to the chess engine worker. One worker, request/response
 * matched by id. Falls back to a synchronous search if Workers are unavailable
 * (e.g. during SSR/tests), so callers always get a move.
 */
import { chooseMove } from './search'
import type { EngineMove } from './types'

export class Engine {
  private worker: Worker | null = null
  private nextId = 1
  private pending = new Map<number, (m: EngineMove | null) => void>()

  constructor() {
    try {
      this.worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' })
      this.worker.onmessage = (e: MessageEvent<{ id: number; move: EngineMove | null }>) => {
        const resolve = this.pending.get(e.data.id)
        if (resolve) {
          this.pending.delete(e.data.id)
          resolve(e.data.move)
        }
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
      this.pending.set(id, resolve)
      this.worker!.postMessage({ id, fen, level })
    })
  }

  dispose() {
    this.worker?.terminate()
    this.worker = null
    this.pending.clear()
  }
}
