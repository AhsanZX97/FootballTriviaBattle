import type { LocalMatchResult, LocalProgress, PendingPurchase } from '../../types/progress'
import type { Customization, CustomizationSlot } from '../../types/customization'
import { DEFAULT_ITEM_ID, defaultCustomization } from '../../types/customization'
import { customizationApi, type CustomizationApi } from '../../services/customization'
import {
  LOCAL_MATCH_CLAIM_LIMIT,
  LOCAL_MATCH_LOG_LIMIT,
  emptyLocalProgress,
} from '../../types/progress'
import { DAILY_REWARD_CYCLE } from '../../types/daily'
import { localProgressApi, type ClaimResult, type LocalProgressApi } from '../../services/localProgress'
import { claimableReward, dailyKey } from '../../services/dailyChallenges'
import { getItem, removeItem, setItem } from '../../services/storage'

/**
 * Coins and match history earned before the player has an account.
 *
 * This is the store that lets a first-time player skip the sign-in wall: the
 * match store and the challenges store write here whenever nobody is signed in,
 * and the auth store drains it into the real profile the moment one appears.
 * See `src/types/progress.ts` for why none of it is trusted.
 */

const STORAGE_KEY = 'ftb.progress'

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

type Listener = () => void

/** Rejects anything that isn't a well-formed match row. Storage is
 * player-writable, so a hand-edited file must degrade to "no history" rather
 * than crash the stats panel or poison the claim payload. */
function readMatch(value: unknown): LocalMatchResult | null {
  if (typeof value !== 'object' || value === null) return null
  const m = value as Record<string, unknown>
  if (m.outcome !== 'win' && m.outcome !== 'loss') return null
  return {
    outcome: m.outcome,
    userScore: typeof m.userScore === 'number' ? m.userScore : 0,
    opponentScore: typeof m.opponentScore === 'number' ? m.opponentScore : 0,
    opponentName: typeof m.opponentName === 'string' ? m.opponentName : 'Player',
    byDisconnect: m.byDisconnect === true,
    createdAt: typeof m.createdAt === 'string' ? m.createdAt : new Date().toISOString(),
  }
}

/** Falls back to the stock look for anything missing or malformed, so a
 * hand-edited file can't leave a slot undefined and break rendering. */
function readCustomization(value: unknown): Customization {
  const stock = defaultCustomization()
  if (typeof value !== 'object' || value === null) return stock
  const c = value as Record<string, unknown>
  const slot = (key: keyof Customization) => (typeof c[key] === 'string' ? (c[key] as string) : stock[key])
  return { gkSkin: slot('gkSkin'), ballSkin: slot('ballSkin'), goalSound: slot('goalSound') }
}

/** Exported for tests, which inject a fake api/storage; the app uses the
 * `localProgressStore` singleton. */
export function createLocalProgressStore(
  deps: {
    api?: LocalProgressApi
    /** Used only at claim time, to re-charge on-device purchases against the
     * real balance and apply the chosen look. */
    shop?: CustomizationApi
    storage?: StorageLike
    now?: () => Date
  } = {},
) {
  const api = deps.api ?? localProgressApi
  const shop = deps.shop ?? customizationApi
  const storage = deps.storage ?? { getItem, setItem, removeItem }
  const now = deps.now ?? (() => new Date())

  let state: LocalProgress = load()
  // A claim in flight. Sign-in can fire more than once per launch (a token
  // refresh re-runs the session handler), and two concurrent claims would
  // double-send the same coins — the second would be capped away server-side,
  // but the player would still see a bogus second "+N".
  let claiming = false
  const listeners = new Set<Listener>()

  function load(): LocalProgress {
    try {
      const raw = storage.getItem(STORAGE_KEY)
      if (!raw) return emptyLocalProgress()
      const parsed = JSON.parse(raw) as Partial<LocalProgress>
      const coins = typeof parsed.coins === 'number' && parsed.coins > 0 ? Math.floor(parsed.coins) : 0
      const matches = Array.isArray(parsed.matches)
        ? parsed.matches.map(readMatch).filter((m): m is LocalMatchResult => m !== null)
        : []
      const streak =
        typeof parsed.dailyRewardStreak === 'number' && parsed.dailyRewardStreak > 0
          ? Math.min(Math.floor(parsed.dailyRewardStreak), DAILY_REWARD_CYCLE)
          : 0
      return {
        coins,
        matches: matches.slice(0, LOCAL_MATCH_LOG_LIMIT),
        dailyRewardStreak: streak,
        lastDailyRewardDate:
          typeof parsed.lastDailyRewardDate === 'string' ? parsed.lastDailyRewardDate : null,
        pendingPurchases: Array.isArray(parsed.pendingPurchases)
          ? parsed.pendingPurchases.filter(
              (p): p is PendingPurchase =>
                typeof p === 'object' && p !== null && typeof (p as PendingPurchase).id === 'string',
            )
          : [],
        customization: readCustomization(parsed.customization),
        adsToday:
          typeof parsed.adsToday === 'number' && parsed.adsToday > 0 ? Math.floor(parsed.adsToday) : 0,
        adsDate: typeof parsed.adsDate === 'string' ? parsed.adsDate : null,
      }
    } catch {
      return emptyLocalProgress()
    }
  }

  const getState = () => state
  const subscribe = (l: Listener): (() => void) => {
    listeners.add(l)
    return () => void listeners.delete(l)
  }

  function commit(next: LocalProgress): void {
    state = next
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // best-effort; storage failures never block gameplay
    }
    listeners.forEach((l) => l())
  }

  /** Bank coins earned on this device. Amounts are whole and positive — a
   * zero award (a forfeit that pays nobody) is not worth a write. */
  function addCoins(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) return
    commit({ ...state, coins: state.coins + Math.floor(amount) })
  }

  function recordMatch(result: LocalMatchResult): void {
    commit({ ...state, matches: [result, ...state.matches].slice(0, LOCAL_MATCH_LOG_LIMIT) })
  }

  /**
   * Take today's login reward without an account.
   *
   * This is the hook that brings a player back on day two, so making them sign
   * up first would defeat the point. Streak state is kept here and driven by
   * the same `claimableReward` the signed-in card uses, so the cycle behaves
   * identically either side of an account — and carries over at claim time.
   *
   * Returns what was granted, or null when today's reward is already taken.
   */
  function claimDailyReward(): { reward: number; streak: number } | null {
    const status = claimableReward(state.dailyRewardStreak, state.lastDailyRewardDate, now())
    if (!status.claimable || status.reward <= 0) return null
    commit({
      ...state,
      coins: state.coins + status.reward,
      dailyRewardStreak: status.day,
      lastDailyRewardDate: dailyKey(now()),
    })
    return { reward: status.reward, streak: status.day }
  }

  /** Cosmetics bought on this device. `default` is never bought — every player
   * starts on it — so it always counts as owned. */
  function owns(itemId: string): boolean {
    return itemId === DEFAULT_ITEM_ID || state.pendingPurchases.some((p) => p.id === itemId)
  }

  /**
   * Buy a cosmetic with local coins. Provisional by design: the item is
   * recorded with the price paid so `claim` can hand the server the gross coins
   * earned and let `purchase_item` charge the real price. A player who can't
   * afford it once the lifetime cap has trimmed their coins loses the item, not
   * the coins — which is the honest outcome, since the local balance was never
   * something we could verify.
   */
  function purchaseItem(itemId: string, price: number): boolean {
    if (owns(itemId) || price < 0 || state.coins < price) return false
    commit({
      ...state,
      coins: state.coins - price,
      pendingPurchases: [...state.pendingPurchases, { id: itemId, price }],
    })
    return true
  }

  /** Equip a cosmetic on-device. Only what the player owns here, so the local
   * look can never show something the sync will fail to grant. */
  function equip(slot: CustomizationSlot, itemId: string): boolean {
    if (!owns(itemId)) return false
    commit({ ...state, customization: { ...state.customization, [slot]: itemId } })
    return true
  }

  /** Rewarded ads left today. The cap is on-device and therefore forgeable —
   * the lifetime claim cap is what actually bounds this, exactly as in
   * 0014's trust-boundary note. */
  function adsRemaining(perDay: number): number {
    const today = dailyKey(now())
    return state.adsDate === today ? Math.max(0, perDay - state.adsToday) : perDay
  }

  /** Bank one watched rewarded ad. Returns false when today's allowance is
   * already spent, so the caller doesn't show a reward that wasn't given. */
  function recordAdReward(coins: number, perDay: number): boolean {
    if (adsRemaining(perDay) <= 0) return false
    const today = dailyKey(now())
    commit({
      ...state,
      coins: state.coins + coins,
      adsToday: state.adsDate === today ? state.adsToday + 1 : 1,
      adsDate: today,
    })
    return true
  }

  /** Throw away everything without banking it. Only for a player who
   * deliberately discards their local progress; sign-in uses `claim`. */
  function clear(): void {
    try {
      storage.removeItem(STORAGE_KEY)
    } catch {
      // best-effort
    }
    state = emptyLocalProgress()
    listeners.forEach((l) => l())
  }

  const hasProgress = () =>
    state.coins > 0 ||
    state.matches.length > 0 ||
    state.dailyRewardStreak > 0 ||
    state.pendingPurchases.length > 0

  /** Coins to claim: the balance *plus* everything already spent on-device. The
   * server re-charges those purchases at its own prices immediately after, so
   * claiming gross and re-buying nets out to the same place — without ever
   * letting the client assert what an item cost. */
  const grossCoins = () =>
    state.coins + state.pendingPurchases.reduce((sum, p) => sum + Math.max(0, p.price), 0)

  /**
   * Re-buy on-device purchases against the real balance, then apply the look.
   *
   * Runs after the coins have landed and in purchase order, so an account whose
   * claim was trimmed by the cap keeps what it can afford earliest rather than
   * failing wholesale. Every failure is survivable: an item that can't be
   * afforded simply stays in the shop, and a slot whose item didn't land falls
   * back to the stock look rather than showing something unowned.
   */
  async function syncPurchases(): Promise<void> {
    const granted = new Set<string>([DEFAULT_ITEM_ID])
    for (const pending of state.pendingPurchases) {
      const { status } = await shop.purchaseItem(pending.id)
      if (status === 'ok' || status === 'already_owned') granted.add(pending.id)
    }

    const stock = defaultCustomization()
    for (const slot of Object.keys(state.customization) as CustomizationSlot[]) {
      const wanted = state.customization[slot]
      if (wanted === stock[slot] || !granted.has(wanted)) continue
      await shop.setCustomization(slot, wanted)
    }
  }

  /**
   * Bank this device's progress into the signed-in account. Cleared only on a
   * confirmed success — a failed claim leaves everything in place so the next
   * launch tries again, which matters most for the players this whole feature
   * exists for: a flaky connection must never cost them their coins.
   *
   * History is sent oldest-first so the rows land in the order they were played.
   */
  async function claim(): Promise<ClaimResult | null> {
    if (claiming || !hasProgress()) return null
    claiming = true
    try {
      const matches = state.matches.slice(0, LOCAL_MATCH_CLAIM_LIMIT).reverse()
      const result = await api.claimLocalProgress(grossCoins(), matches, {
        streak: state.dailyRewardStreak,
        lastDate: state.lastDailyRewardDate,
      })
      if (!result) return null

      // Purchases are re-charged before clearing, so a mid-sync failure leaves
      // the local state intact for the next attempt rather than silently
      // dropping the items. Its own try: a failed re-buy must not cost the
      // player the coins that already landed.
      try {
        await syncPurchases()
      } catch (err) {
        console.error('[progress] purchase sync failed', err)
      }

      clear()
      return result
    } catch (err) {
      console.error('[progress] claim failed', err)
      return null
    } finally {
      claiming = false
    }
  }

  /** Timestamp helper so callers don't each reach for `new Date()` — keeps the
   * injected clock authoritative in tests. */
  const timestamp = () => now().toISOString()

  return {
    getState,
    subscribe,
    addCoins,
    recordMatch,
    claimDailyReward,
    owns,
    purchaseItem,
    equip,
    adsRemaining,
    recordAdReward,
    claim,
    clear,
    hasProgress,
    timestamp,
  }
}

export type LocalProgressStore = ReturnType<typeof createLocalProgressStore>

export const localProgressStore = createLocalProgressStore()
