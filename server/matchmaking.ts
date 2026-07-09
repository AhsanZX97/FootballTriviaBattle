export interface QueuedPlayer {
  id: string
  name: string
  /** Authed players only; used to stop the same account from self-matching across two devices/tabs. */
  userId?: string
}

export interface Queue {
  waiting: QueuedPlayer[]
}

export interface EnqueueResult {
  queue: Queue
  /** Set once two players are waiting; FIFO order, first entry goes first. */
  pair: [QueuedPlayer, QueuedPlayer] | null
}

export function createQueue(): Queue {
  return { waiting: [] }
}

/** Two authed players are the same account trying to farm coins off itself. Anonymous (no userId) is always compatible. */
function canPair(x: QueuedPlayer, y: QueuedPlayer): boolean {
  return !(x.userId && x.userId === y.userId)
}

/**
 * Add a player to the queue, pairing them with the earliest still-waiting
 * player they're compatible with (anyone but the same authed userId). If no
 * one currently waiting is compatible, the new player waits too.
 */
export function enqueue(queue: Queue, player: QueuedPlayer): EnqueueResult {
  const opponentIndex = queue.waiting.findIndex((candidate) => canPair(candidate, player))
  if (opponentIndex === -1) {
    return { queue: { waiting: [...queue.waiting, player] }, pair: null }
  }
  const opponent = queue.waiting[opponentIndex]!
  const waiting = queue.waiting.filter((_, index) => index !== opponentIndex)
  return { queue: { waiting }, pair: [opponent, player] }
}

/** Remove a player from the queue (cancel, or disconnect while still waiting). No-op if absent. */
export function dequeue(queue: Queue, id: string): Queue {
  return { waiting: queue.waiting.filter((p) => p.id !== id) }
}
