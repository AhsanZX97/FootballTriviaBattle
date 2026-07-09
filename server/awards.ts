export interface MatchPlayers {
  aUserId: string | null
  bUserId: string | null
}

export type SettleReason = 'completed' | 'forfeitA' | 'forfeitB'

export interface Award {
  userId: string
  amount: number
}

const WIN_AMOUNT = 3
const COMPLETED_LOSS_AMOUNT = 1
const FORFEIT_QUITTER_AMOUNT = 0

/**
 * Coin award rules for a finished 1v1 match. `shootoutStatus` is
 * room.shootout.status, which is always relative to slot 'a' — for a forfeit
 * this is already flipped by room.ts's `forfeit()` (leaver's slot loses), so
 * the winner/loser split falls out of status alone; `reason` only changes the
 * *amount* (a completed loss still pays 1, a forfeited "loss" — the quitter —
 * pays 0). Anonymous players (`null` userId) are silently filtered out, never
 * an error.
 */
export function settleMatch(
  shootoutStatus: 'won' | 'lost',
  players: MatchPlayers,
  reason: SettleReason,
): Award[] {
  const aWon = shootoutStatus === 'won'
  const winnerId = aWon ? players.aUserId : players.bUserId
  const loserId = aWon ? players.bUserId : players.aUserId
  const loserAmount = reason === 'completed' ? COMPLETED_LOSS_AMOUNT : FORFEIT_QUITTER_AMOUNT

  const awards: Award[] = []
  if (winnerId) awards.push({ userId: winnerId, amount: WIN_AMOUNT })
  if (loserId) awards.push({ userId: loserId, amount: loserAmount })
  return awards
}
