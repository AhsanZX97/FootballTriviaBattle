import { coinsForTries } from '../../game/levels/rewards'
import { isSolved } from '../../game/levels/progress'
import { footballBank } from '../../services/trivia/bank'
import { levelsApi, type LevelsApi } from '../../services/levels'
import { getItem, removeItem, setItem } from '../../services/storage'
import { authStore } from '../auth/store'
import { localProgressStore } from '../progress/store'

/**
 * Level-mode progress: which cards are solved, and how many wrong tries an
 * open card has taken so far. Tries persist with the rest, or closing the app
 * mid-question would reset the dropped reward back to 3.
 *
 * Kept on-device for everyone. Signed in, the server is what pays and what
 * enforces once-per-question; this copy only drives the grid.
 */
export interface LevelState {
  solved: Readonly<Record<string, number>>
  tries: Readonly<Record<string, number>>
}

export type AnswerResult =
  | { kind: 'wrong'; wrongTries: number }
  | { kind: 'correct'; coins: number; alreadySolved: boolean }
  /** Unknown question, or a signed-in claim that didn't land. Nothing changed. */
  | { kind: 'error' }

const STORAGE_KEY = 'ftb.levels'

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

type Listener = () => void

const emptyState = (): LevelState => ({ solved: {}, tries: {} })

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

const bankAnswer = (id: string) => footballBank.find((q) => q.id === id)

/** Exported for tests, which inject fakes; the app uses `levelStore`. */
export function createLevelStore(
  deps: {
    api?: LevelsApi
    auth?: { getState(): { status: string }; applyCoinsUpdate(balance: number): void }
    progress?: { addCoins(amount: number): void }
    storage?: StorageLike
    findQuestion?: (id: string) => { correctAnswer: string } | undefined
  } = {},
) {
  const api = deps.api ?? levelsApi
  const auth = deps.auth ?? authStore
  const progress = deps.progress ?? localProgressStore
  const storage = deps.storage ?? { getItem, setItem, removeItem }
  const findQuestion = deps.findQuestion ?? bankAnswer

  let state: LevelState = load()
  const listeners = new Set<Listener>()

  function load(): LevelState {
    try {
      const raw = storage.getItem(STORAGE_KEY)
      if (!raw) return emptyState()
      const parsed = JSON.parse(raw) as Partial<Record<keyof LevelState, unknown>>
      return { solved: readCounts(parsed.solved), tries: readCounts(parsed.tries) }
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

  function markSolved(questionId: string, wrongTries: number): void {
    const { [questionId]: _done, ...tries } = state.tries
    commit({ solved: { ...state.solved, [questionId]: wrongTries }, tries })
  }

  /** Coins paid for this solve, or null when a signed-in claim failed. */
  async function pay(questionId: string, wrongTries: number): Promise<{ coins: number; repeat: boolean } | null> {
    if (auth.getState().status !== 'signedIn') {
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
    return { kind: 'correct', coins: paid.coins, alreadySolved: paid.repeat }
  }

  return { getState, subscribe, answer }
}

export type LevelStore = ReturnType<typeof createLevelStore>

export const levelStore = createLevelStore()
