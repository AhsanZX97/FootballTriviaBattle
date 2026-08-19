import { supabase } from './supabase'
import type { MatchHistoryEntry, MatchStats } from '../types/stats'

/** The stats operations the stats store depends on. An interface so the
 * store's tests can inject a fake instead of hitting the network (same seam as
 * `CustomizationApi`). */
export interface StatsApi {
  /** The signed-in player's win/loss tally + last five games. */
  fetchStats(): Promise<MatchStats>
}

const EMPTY_STATS: MatchStats = { wins: 0, losses: 0, recent: [] }

async function fetchStats(): Promise<MatchStats> {
  const { data, error } = await supabase.rpc('get_match_stats')
  if (error || !data) {
    if (error) console.error('[stats] get_match_stats failed', error)
    return EMPTY_STATS
  }
  const raw = data as { wins?: number; losses?: number; recent?: MatchHistoryEntry[] }
  return {
    wins: raw.wins ?? 0,
    losses: raw.losses ?? 0,
    recent: raw.recent ?? [],
  }
}

export const statsApi: StatsApi = { fetchStats }
