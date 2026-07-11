/**
 * Bookkeeping for in-flight friend challenges, keyed by challenge id. Pure
 * connection-id plumbing — it never touches WebSockets or Supabase, so it's
 * unit-testable in isolation (see __tests__/challenges.test.ts). index.ts owns
 * resolving userIds to live connections, delivery, timers, and room creation.
 */
export interface PendingChallenge {
  id: string
  /** Connection id of the player who sent the challenge. */
  challengerConnId: string
  /** Connection id of the player being challenged. */
  targetConnId: string
  createdAt: number
}

export interface ChallengeStore {
  add(challenge: PendingChallenge): void
  get(id: string): PendingChallenge | undefined
  /** Removes and returns the challenge, or undefined if it was already gone. */
  remove(id: string): PendingChallenge | undefined
  /** The challenger's single outstanding outgoing challenge, if any. */
  outgoingFor(connId: string): PendingChallenge | undefined
  /** Removes every challenge this connection is part of (as challenger or
   * target) and returns them — used to clean up on disconnect. */
  removeInvolving(connId: string): PendingChallenge[]
}

export function createChallengeStore(): ChallengeStore {
  const byId = new Map<string, PendingChallenge>()

  return {
    add(challenge) {
      byId.set(challenge.id, challenge)
    },
    get(id) {
      return byId.get(id)
    },
    remove(id) {
      const found = byId.get(id)
      if (found) byId.delete(id)
      return found
    },
    outgoingFor(connId) {
      for (const challenge of byId.values()) {
        if (challenge.challengerConnId === connId) return challenge
      }
      return undefined
    },
    removeInvolving(connId) {
      const removed: PendingChallenge[] = []
      for (const challenge of byId.values()) {
        if (challenge.challengerConnId === connId || challenge.targetConnId === connId) {
          removed.push(challenge)
          byId.delete(challenge.id)
        }
      }
      return removed
    },
  }
}
