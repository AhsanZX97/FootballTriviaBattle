import type { DailyChallengeDef, DailyChallengeId } from '../../types/daily'
import {
  challengeDef,
  dailyKey,
  pickDailyChallenges,
} from '../../services/dailyChallenges'
import { getItem, removeItem, setItem } from '../../services/storage'
import { supabase } from '../../services/supabase'
import { authStore } from '../auth/store'

/** One challenge as the UI needs it: its definition plus this player's progress
 * and whether the reward has been banked today. */
export interface ChallengeView {
  def: DailyChallengeDef
  /** Clamped to `def.goal`. */
  progress: number
  complete: boolean
  claimed: boolean
}

export interface ChallengesState {
  /** The calendar day (YYYY-MM-DD) this state describes. */
  dayKey: string
  /** Today's active challenges, in display order. */
  challenges: ChallengeView[]
  /** Id currently being claimed, so its button can show progress. */
  claiming: DailyChallengeId | null
}

/** The one operation the store needs from the network, behind a seam so tests
 * can inject a fake (same pattern as CustomizationApi). Returns the new coin
 * balance, or null if the claim was rejected/already banked server-side. */
export interface ChallengeApi {
  claimChallenge(id: DailyChallengeId): Promise<number | null>
}

/** Minimal slice of the auth store this store needs. Injected for tests. */
export interface ChallengesAuthSeam {
  getState(): { status: string }
  applyCoinsUpdate(balance: number): void
}

interface PersistShape {
  progress: Record<string, number>
  claimed: Record<string, boolean>
}

type Listener = () => void

const defaultApi: ChallengeApi = {
  async claimChallenge(id) {
    const { data, error } = await supabase.rpc('claim_daily_challenge', { p_challenge_id: id })
    if (error) {
      console.error('[challenges] claim_daily_challenge failed', { id, error })
      return null
    }
    return typeof data === 'number' ? data : null
  },
}

const storageKey = (day: string) => `ftb.daily.${day}`

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** Exported for tests, which inject a fake api/auth/clock/storage; the app uses
 * the `challengesStore` singleton. Progress is tracked on-device; the server
 * only guards the coin payout (each challenge claimable once per day). */
export function createChallengesStore(
  deps: {
    api?: ChallengeApi
    auth?: ChallengesAuthSeam
    storage?: StorageLike
    now?: () => Date
  } = {},
) {
  const api = deps.api ?? defaultApi
  const auth = deps.auth ?? (authStore as unknown as ChallengesAuthSeam)
  const storage = deps.storage ?? { getItem, setItem, removeItem }
  const now = deps.now ?? (() => new Date())

  let dayKeyValue = ''
  let progress: Record<string, number> = {}
  let claimed: Record<string, boolean> = {}
  let claiming: DailyChallengeId | null = null
  let state: ChallengesState = { dayKey: '', challenges: [], claiming: null }
  const listeners = new Set<Listener>()

  const getState = () => state
  const subscribe = (l: Listener): (() => void) => {
    listeners.add(l)
    return () => void listeners.delete(l)
  }

  function persist(): void {
    try {
      storage.setItem(storageKey(dayKeyValue), JSON.stringify({ progress, claimed } satisfies PersistShape))
    } catch {
      // best-effort; storage failures never block gameplay
    }
  }

  function rebuild(): void {
    const challenges: ChallengeView[] = pickDailyChallenges(dayKeyValue).map((id) => {
      const def = challengeDef(id)
      const p = Math.min(progress[id] ?? 0, def.goal)
      return { def, progress: p, complete: p >= def.goal, claimed: !!claimed[id] }
    })
    state = { dayKey: dayKeyValue, challenges, claiming }
    listeners.forEach((l) => l())
  }

  function loadDay(key: string): void {
    dayKeyValue = key
    progress = {}
    claimed = {}
    try {
      const raw = storage.getItem(storageKey(key))
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PersistShape>
        progress = parsed.progress ?? {}
        claimed = parsed.claimed ?? {}
      }
    } catch {
      // corrupt/absent — start the day fresh
    }
    claiming = null
    rebuild()
  }

  /** Roll over to a new calendar day if one has started since we last looked. */
  function ensureToday(): void {
    const key = dailyKey(now())
    if (key !== dayKeyValue) loadDay(key)
  }

  const isActive = (id: DailyChallengeId) => state.challenges.some((c) => c.def.id === id)

  /** Add to a challenge's progress if it's one of today's and not yet claimed. */
  function bump(id: DailyChallengeId, n: number): void {
    ensureToday()
    if (!isActive(id) || claimed[id]) return
    const def = challengeDef(id)
    const before = progress[id] ?? 0
    const next = Math.min(before + n, def.goal)
    if (next === before) return
    progress[id] = next
    persist()
    rebuild()
  }

  /** A resolved answer to one of my own kicks. `wasShoot` distinguishes a scored
   * penalty (shoot stage) from a save (keep stage). */
  function recordAnswer(correct: boolean, wasShoot: boolean): void {
    if (!correct) return
    bump('answer_15', 1)
    if (wasShoot) bump('score_5_pens', 1)
  }

  function record1v1Win(): void {
    bump('win_1v1', 1)
  }

  /** Cash in a completed challenge. The server guards the payout (once per day);
   * a null return means it was already banked server-side, which we mirror
   * locally rather than nag. */
  async function claim(id: DailyChallengeId): Promise<boolean> {
    ensureToday()
    if (auth.getState().status !== 'signedIn') return false
    const view = state.challenges.find((c) => c.def.id === id)
    if (!view || !view.complete || view.claimed || claiming) return false

    claiming = id
    rebuild()
    const balance = await api.claimChallenge(id)
    claimed[id] = true
    if (typeof balance === 'number') auth.applyCoinsUpdate(balance)
    persist()
    claiming = null
    rebuild()
    return true
  }

  /** Recompute for the current day — call on mount so a day rollover shows. */
  function refresh(): void {
    ensureToday()
    rebuild()
  }

  loadDay(dailyKey(now()))

  return {
    getState,
    subscribe,
    refresh,
    recordAnswer,
    record1v1Win,
    claim,
  }
}

export type ChallengesStore = ReturnType<typeof createChallengesStore>

export const challengesStore = createChallengesStore()
