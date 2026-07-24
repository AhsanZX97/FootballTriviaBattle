import type { MatchHistoryEntry } from '../../types/stats'
import { statsApi, type StatsApi } from '../../services/stats'
import { authStore } from '../auth/store'

export interface StatsState {
  status: 'idle' | 'loading' | 'loaded'
  wins: number
  losses: number
  recent: MatchHistoryEntry[]
  /** Surfaced when the fetch fails; the tab still renders (with whatever it had). */
  error: string | null
}

/** Minimal slice of the auth store this store needs. Injected so tests can
 * drive it without the real singleton (same seam as the shop store). */
export interface StatsAuthSeam {
  getState(): { status: string }
}

type Listener = () => void

const LOAD_FAILED_ERROR = 'Could not load your stats.'

const emptyState = (): StatsState => ({
  status: 'idle',
  wins: 0,
  losses: 0,
  recent: [],
  error: null,
})

/** Exported for tests, which inject a fake api and auth seam; the app uses the
 * `statsStore` singleton. */
export function createStatsStore(deps: { api?: StatsApi; auth?: StatsAuthSeam } = {}) {
  const api = deps.api ?? statsApi
  const auth = deps.auth ?? (authStore as unknown as StatsAuthSeam)

  let state: StatsState = emptyState()
  const listeners = new Set<Listener>()

  const getState = () => state
  const subscribe = (l: Listener): (() => void) => {
    listeners.add(l)
    return () => void listeners.delete(l)
  }
  const set = (patch: Partial<StatsState>) => {
    state = { ...state, ...patch }
    listeners.forEach((l) => l())
  }

  const signedIn = () => auth.getState().status === 'signedIn'

  /** Load the player's record + recent games. Called each time the stat tab
   * opens. A signed-out caller resets to the empty record without a request. */
  async function refresh(): Promise<void> {
    if (!signedIn()) {
      set({ ...emptyState(), status: 'loaded' })
      return
    }
    // Keep prior numbers on screen through a refresh rather than flashing zeros.
    set({ status: 'loading', error: null })
    try {
      const stats = await api.fetchStats()
      set({ status: 'loaded', wins: stats.wins, losses: stats.losses, recent: stats.recent })
    } catch (err) {
      console.error('[stats] refresh failed', err)
      set({ status: 'loaded', error: LOAD_FAILED_ERROR })
    }
  }

  return { getState, subscribe, refresh }
}

export type StatsStore = ReturnType<typeof createStatsStore>

export const statsStore = createStatsStore()
