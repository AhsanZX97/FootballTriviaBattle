export interface QueuedPlayer {
  id: string
  name: string
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

/** Add a player to the queue, pairing them off immediately if someone's already waiting. */
export function enqueue(queue: Queue, player: QueuedPlayer): EnqueueResult {
  const waiting = [...queue.waiting, player]
  if (waiting.length < 2) return { queue: { waiting }, pair: null }
  const [a, b, ...rest] = waiting
  return { queue: { waiting: rest }, pair: [a, b] }
}

/** Remove a player from the queue (cancel, or disconnect while still waiting). No-op if absent. */
export function dequeue(queue: Queue, id: string): Queue {
  return { waiting: queue.waiting.filter((p) => p.id !== id) }
}
