/** How a recorded match was played. Mirrors the match store's MatchMode but
 * kept standalone so the stats types don't pull in the match feature. */
export type StatsMatchMode = 'cpu' | '1v1'

/** One finished match in the signed-in player's history, as returned by the
 * `get_match_stats` RPC (already camelCased server-side). `opponentName` is
 * 'CPU' for a vs-CPU game, otherwise the opponent's display name. */
export interface MatchHistoryEntry {
  mode: StatsMatchMode
  opponentName: string
  outcome: 'win' | 'loss'
  userScore: number
  opponentScore: number
  /** True when the match ended because a side disconnected/quit — a win means
   * the opponent left, a loss means this player did. */
  byDisconnect: boolean
  createdAt: string
}

/** The player's lifetime win/loss tally plus their five most recent matches. */
export interface MatchStats {
  wins: number
  losses: number
  recent: MatchHistoryEntry[]
}
