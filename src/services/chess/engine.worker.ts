/// <reference lib="webworker" />
/** Thin worker: runs the pure negamax search off the main thread. */
import { chooseMove } from './search'

interface Request {
  id: number
  fen: string
  level: number
}

self.onmessage = (e: MessageEvent<Request>) => {
  const { id, fen, level } = e.data
  const move = chooseMove(fen, level)
  ;(self as unknown as Worker).postMessage({ id, move })
}
