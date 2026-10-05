import { coinsForTries } from '../../game/levels/rewards'
import { LEVELS, type LevelDef } from '../../game/levels/manifest'
import { isComplete, isSolved } from '../../game/levels/progress'
import { footballBank } from '../../services/trivia/bank'
import { levelsApi, type LevelProgressResponse, type LevelsApi } from '../../services/levels'
import { findItem } from '../../services/shopCatalogue'
import { analytics } from '../../services/analytics'
import { getItem, removeItem, setItem } from '../../services/storage'
import type { AnalyticsEventName, AnalyticsProps } from '../../types/analytics'
import { authStore } from '../auth/store'
import { challengesStore } from '../challenges/store'
import { localProgressStore } from '../progress/store'

/**
 * Level-mode progress: which cards are solved, how many wrong tries an open
 * card has taken so far, and which levels' prizes are claimed. Tries persist
 * with the rest, or closing the app mid-question would reset the dropped
 * reward back to 3.
 *
 * Kept on-device for everyone. Signed in, the server is what pays and what
 * enforces once-per-question and once-per-prize; this copy mirrors the account
 * and drives the grid.
 */
export interface LevelState {
  solved: Readonly<Record<string, number>>
  tries: Readonly<Record<string, number>>
  prizes: readonly number[]
}

export type AnswerResult =
  | { kind: 'wrong'; wrongTries: number }
  | { kind: 'correct'; coins: number; alreadySolved: boolean }
  /** Unknown question, or a signed-in claim that didn't land. Nothing changed. */
  | { kind: 'error' }

export type PrizeResult =
  | { kind: 'item'; itemId: string }
  /** `itemId` is set when the prize was an item the player already owned. */
  | { kind: 'coins'; coins: number; itemId?: string }
  | { kind: 'already' }
  /** Unknown or unfinished level, or a signed-in claim that didn't land. */
  | { kind: 'error' }

const STORAGE_KEY = 'ftb.levels'

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

type Listener = () => void

const emptyState = (): LevelState => ({ solved: {}, tries: {}, prizes: [] })

/** Storage is player-writable: anything that isn't a map of whole,
 * non-negative counts is dropped rather than trusted. */
function readCounts(value: unknown): Record<string, number> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const out: Record<string, number> = {}
  for (const [id, n] of Object.entries(value)) {
    if (typeof n === 'number' && Number.isInteger(n) && n >= 0) out[id] = n
  }
  return out
}

function readLevels(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value.filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1)
}

const bankAnswer = (id: string) => footballBank.find((q) => q.id === id)

/** Exported for tests, which inject fakes; the app uses `levelStore`. */
export function createLevelStore(
  deps: {
    api?: LevelsApi
    auth?: {
      getState(): { status: string }
      applyCoinsUpdate(balance: number): void
      subscribe?(listener: () => void): () => void
      addSignInTask?(task: () => Promise<void>): void
    }
    progress?: {
      addCoins(amount: number): void
      owns(itemId: string): boolean
      grantItem(itemId: string): boolean
    }
    challenges?: { recordAnswer(correct: boolean, wasShoot: boolean): void }
    track?: <N extends AnalyticsEventName>(name: N, props: AnalyticsProps<N>) => void
    storage?: StorageLike
    levels?: readonly LevelDef[]
    priceOf?: (itemId: string) => number | undefined
    findQuestion?: (id: string) => { correctAnswer: string } | undefined
  } = {},
) {
  const api = deps.api ?? levelsApi
  const auth = deps.auth ?? authStore
  const progress = deps.progress ?? localProgressStore
  const challenges = deps.challenges ?? challengesStore
  const track = deps.track ?? analytics.track
  const storage = deps.storage ?? { getItem, setItem, removeItem }
  const levels = deps.levels ?? LEVELS
  const priceOf = deps.priceOf ?? ((id: string) => findItem(id)?.price)
  const findQuestion = deps.findQuestion ?? bankAnswer

  let state: LevelState = load()
  let claimingPrize = false
  let syncing = false
  const listeners = new Set<Listener>()

  function load(): LevelState {
    try {
      const raw = storage.getItem(STORAGE_KEY)
      if (!raw) return emptyState()
      const parsed = JSON.parse(raw) as Partial<Record<keyof LevelState, unknown>>
      return {
        solved: readCounts(parsed.solved),
        tries: readCounts(parsed.tries),
        prizes: readLevels(parsed.prizes),
      }
    } catch {
      return emptyState()
    }
  }

  const getState = () => state
  const subscribe = (l: Listener): (() => void) => {
    listeners.add(l)
    return () => void listeners.delete(l)
  }

  function commit(next: LevelState): void {
    state = next
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // best-effort; storage failures never block gameplay
    }
    listeners.forEach((l) => l())
  }

  const signedIn = () => auth.getState().status === 'signedIn'
  const levelOfQuestion = (questionId: string) => levels.find((l) => l.questionIds.includes(questionId))

  function markSolved(questionId: string, wrongTries: number): void {
    const { [questionId]: _done, ...tries } = state.tries
    commit({ ...state, solved: { ...state.solved, [questionId]: wrongTries }, tries })
  }

  /** Coins paid for this solve, or null when a signed-in claim failed. */
  async function pay(questionId: string, wrongTries: number): Promise<{ coins: number; repeat: boolean } | null> {
    if (!signedIn()) {
      const coins = coinsForTries(wrongTries)
      progress.addCoins(coins)
      return { coins, repeat: false }
    }
    try {
      const result = await api.claimQuestion(questionId, wrongTries)
      if (!result) return null
      auth.applyCoinsUpdate(result.coins)
      return { coins: result.coinsPaid, repeat: result.status === 'already_solved' }
    } catch (err) {
      console.error('[levels] claim failed', err)
      return null
    }
  }

  async function answer(questionId: string, choice: string): Promise<AnswerResult> {
    const question = findQuestion(questionId)
    if (!question) return { kind: 'error' }
    const solved = isSolved(state.solved, questionId)

    if (choice !== question.correctAnswer) {
      if (solved) return { kind: 'wrong', wrongTries: 0 }
      const wrongTries = (state.tries[questionId] ?? 0) + 1
      commit({ ...state, tries: { ...state.tries, [questionId]: wrongTries } })
      return { kind: 'wrong', wrongTries }
    }

    if (solved) return { kind: 'correct', coins: 0, alreadySolved: true }

    const wrongTries = state.tries[questionId] ?? 0
    const paid = await pay(questionId, wrongTries)
    if (!paid) return { kind: 'error' }
    markSolved(questionId, wrongTries)

    challenges.recordAnswer(true, false)
    const level = levelOfQuestion(questionId)
    if (level) {
      track('level_question_answered', { level: level.level, wrongTries })
      if (isComplete(level, state.solved)) track('level_completed', { level: level.level })
    }
    return { kind: 'correct', coins: paid.coins, alreadySolved: paid.repeat }
  }

  function markClaimed(level: number): void {
    if (!state.prizes.includes(level)) commit({ ...state, prizes: [...state.prizes, level] })
  }

  /** Signed out: grant or pay on-device. The account receives it later through
   * `import_level_progress`, which re-checks the level was finished. */
  function claimPrizeLocally(def: LevelDef): PrizeResult {
    const { prize } = def
    if (prize.kind === 'coins') {
      progress.addCoins(prize.coins)
      return { kind: 'coins', coins: prize.coins }
    }
    if (progress.grantItem(prize.itemId)) return { kind: 'item', itemId: prize.itemId }
    const coins = priceOf(prize.itemId) ?? 0
    progress.addCoins(coins)
    return { kind: 'coins', coins, itemId: prize.itemId }
  }

  async function claimPrizeOnServer(def: LevelDef): Promise<PrizeResult> {
    const result = await api.claimPrize(def.level)
    if (!result) return { kind: 'error' }
    auth.applyCoinsUpdate(result.coins)
    if (result.status === 'already_claimed') return { kind: 'already' }
    if (result.itemId) return { kind: 'item', itemId: result.itemId }
    const ownedItem = def.prize.kind === 'item' ? { itemId: def.prize.itemId } : {}
    return { kind: 'coins', coins: result.coinsPaid, ...ownedItem }
  }

  /** Pay a finished level's prize, once. */
  async function claimPrize(level: number): Promise<PrizeResult> {
    const def = levels.find((l) => l.level === level)
    if (!def || !isComplete(def, state.solved) || claimingPrize) return { kind: 'error' }
    if (state.prizes.includes(level)) return { kind: 'already' }

    claimingPrize = true
    try {
      const result = signedIn() ? await claimPrizeOnServer(def) : claimPrizeLocally(def)
      if (result.kind !== 'error') markClaimed(level)
      if (result.kind === 'item' || result.kind === 'coins') {
        track('level_prize_claimed', { level, kind: result.kind })
      }
      return result
    } catch (err) {
      console.error('[levels] prize claim failed', err)
      return { kind: 'error' }
    } finally {
      claimingPrize = false
    }
  }

  function mirror(server: LevelProgressResponse): void {
    const tries = Object.fromEntries(Object.entries(state.tries).filter(([id]) => !isSolved(server.solved, id)))
    commit({ solved: server.solved, tries, prizes: server.prizes })
  }

  /**
   * Runs once a session starts, before the local-progress claim (so prize
   * items it grants can be equipped by that claim). Sends whatever the device
   * holds — progress made signed out pays nothing twice, the server records it
   * with zero coins — and replaces the local copy with the account's. A failure
   * leaves the device untouched for the next launch to retry.
   */
  async function syncOnSignIn(): Promise<void> {
    if (syncing) return
    syncing = true
    try {
      const hasLocal = Object.keys(state.solved).length > 0 || state.prizes.length > 0
      const server = hasLocal
        ? await api.importProgress({ ...state.solved }, [...state.prizes])
        : await api.listProgress()
      if (server) mirror(server)
    } catch (err) {
      console.error('[levels] sign-in sync failed', err)
    } finally {
      syncing = false
    }
  }

  // Signing out wipes the account's mirror, or the next account to sign in on
  // this device would import it as its own. Auth always boots as 'loading'
  // and only moves on from an async session callback, after this has run.
  let lastStatus = 'loading'
  auth.subscribe?.(() => {
    const status = auth.getState().status
    if (lastStatus === 'signedIn' && status === 'signedOut') commit(emptyState())
    lastStatus = status
  })
  auth.addSignInTask?.(syncOnSignIn)

  return { getState, subscribe, answer, claimPrize, syncOnSignIn }
}

export type LevelStore = ReturnType<typeof createLevelStore>

export const levelStore = createLevelStore()
