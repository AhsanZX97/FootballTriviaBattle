import { describe, expect, it, vi } from 'vitest'
import { createLevelStore } from '../store'
import type { ClaimQuestionResponse, LevelsApi } from '../../../services/levels'

const QUESTIONS: Record<string, { correctAnswer: string }> = {
  q1: { correctAnswer: 'Brazil' },
  q2: { correctAnswer: 'Spain' },
}

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial }
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v
    },
    removeItem: (k: string) => {
      delete data[k]
    },
  }
}

function makeDeps(
  opts: {
    status?: string
    claim?: LevelsApi['claimQuestion']
    storage?: ReturnType<typeof memoryStorage>
  } = {},
) {
  const balances: number[] = []
  const localCoins: number[] = []
  const api: LevelsApi = {
    claimQuestion:
      opts.claim ??
      vi.fn(async (_id: string, tries: number): Promise<ClaimQuestionResponse> => ({
        status: 'ok',
        coinsPaid: Math.max(1, 3 - tries),
        coins: 100 + Math.max(1, 3 - tries),
      })),
  }
  const storage = opts.storage ?? memoryStorage()
  const deps = {
    api,
    storage,
    auth: {
      getState: () => ({ status: opts.status ?? 'signedOut' }),
      applyCoinsUpdate: (b: number) => void balances.push(b),
    },
    progress: { addCoins: (n: number) => void localCoins.push(n) },
    findQuestion: (id: string) => QUESTIONS[id],
  }
  return { deps, api, storage, balances, localCoins }
}

describe('level store — signed out', () => {
  it('counts a wrong answer as a try without paying anything', async () => {
    const { deps, localCoins } = makeDeps()
    const store = createLevelStore(deps)

    expect(await store.answer('q1', 'Italy')).toEqual({ kind: 'wrong', wrongTries: 1 })
    expect(store.getState().tries).toEqual({ q1: 1 })
    expect(store.getState().solved).toEqual({})
    expect(localCoins).toEqual([])
  })

  it('pays a dropped reward into local coins once the right answer lands', async () => {
    const { deps, localCoins } = makeDeps()
    const store = createLevelStore(deps)

    await store.answer('q1', 'Italy')
    expect(await store.answer('q1', 'Brazil')).toEqual({ kind: 'correct', coins: 2, alreadySolved: false })
    expect(localCoins).toEqual([2])
    expect(store.getState().solved).toEqual({ q1: 1 })
    expect(store.getState().tries).toEqual({})
  })

  it('pays the full 3 for a clean answer', async () => {
    const { deps, localCoins } = makeDeps()
    const store = createLevelStore(deps)

    await store.answer('q1', 'Brazil')
    expect(localCoins).toEqual([3])
  })

  it('pays nothing for answering a solved question again', async () => {
    const { deps, localCoins } = makeDeps()
    const store = createLevelStore(deps)

    await store.answer('q1', 'Brazil')
    expect(await store.answer('q1', 'Brazil')).toEqual({ kind: 'correct', coins: 0, alreadySolved: true })
    expect(await store.answer('q1', 'Italy')).toEqual({ kind: 'wrong', wrongTries: 0 })
    expect(localCoins).toEqual([3])
    expect(store.getState().solved).toEqual({ q1: 0 })
  })

  it('refuses a question it does not know', async () => {
    const { deps, localCoins } = makeDeps()
    const store = createLevelStore(deps)

    expect(await store.answer('nope', 'Brazil')).toEqual({ kind: 'error' })
    expect(localCoins).toEqual([])
  })

  it('notifies subscribers on every change', async () => {
    const { deps } = makeDeps()
    const store = createLevelStore(deps)
    const listener = vi.fn()
    store.subscribe(listener)

    await store.answer('q1', 'Italy')
    await store.answer('q1', 'Brazil')
    expect(listener).toHaveBeenCalledTimes(2)
  })
})

describe('level store — persistence', () => {
  it('survives a restart, including tries on an unsolved card', async () => {
    const storage = memoryStorage()
    const first = createLevelStore(makeDeps({ storage }).deps)
    await first.answer('q1', 'Brazil')
    await first.answer('q2', 'Italy')

    const second = createLevelStore(makeDeps({ storage }).deps)
    expect(second.getState().solved).toEqual({ q1: 0 })
    expect(second.getState().tries).toEqual({ q2: 1 })
  })

  it('keeps the reward dropped after reopening the app mid-question', async () => {
    const storage = memoryStorage()
    await createLevelStore(makeDeps({ storage }).deps).answer('q1', 'Italy')

    const { deps, localCoins } = makeDeps({ storage })
    await createLevelStore(deps).answer('q1', 'Brazil')
    expect(localCoins).toEqual([2])
  })

  it('degrades a hand-edited file to no progress rather than crashing', () => {
    const corrupt = memoryStorage({ 'ftb.levels': '{"solved":{"q1":"lots","q2":-1},"tries":[1]}' })
    expect(createLevelStore(makeDeps({ storage: corrupt }).deps).getState()).toEqual({
      solved: {},
      tries: {},
    })

    const garbage = memoryStorage({ 'ftb.levels': 'not json' })
    expect(createLevelStore(makeDeps({ storage: garbage }).deps).getState()).toEqual({
      solved: {},
      tries: {},
    })
  })
})

describe('level store — signed in', () => {
  it('claims through the server with the try count and shows the new balance', async () => {
    const { deps, api, balances, localCoins } = makeDeps({ status: 'signedIn' })
    const store = createLevelStore(deps)

    await store.answer('q1', 'Italy')
    expect(await store.answer('q1', 'Brazil')).toEqual({ kind: 'correct', coins: 2, alreadySolved: false })
    expect(api.claimQuestion).toHaveBeenCalledWith('q1', 1)
    expect(balances).toEqual([102])
    expect(localCoins).toEqual([])
    expect(store.getState().solved).toEqual({ q1: 1 })
  })

  it('pays what the server says, not what the client computed', async () => {
    const claim = vi.fn(async (): Promise<ClaimQuestionResponse> => ({
      status: 'already_solved',
      coinsPaid: 0,
      coins: 250,
    }))
    const { deps, balances } = makeDeps({ status: 'signedIn', claim })
    const store = createLevelStore(deps)

    expect(await store.answer('q1', 'Brazil')).toEqual({ kind: 'correct', coins: 0, alreadySolved: true })
    expect(balances).toEqual([250])
    expect(store.getState().solved).toEqual({ q1: 0 })
  })

  it('leaves the card open when the claim fails, so the player can try again', async () => {
    const claim = vi.fn(async () => null)
    const { deps, balances } = makeDeps({ status: 'signedIn', claim })
    const store = createLevelStore(deps)

    await store.answer('q1', 'Italy')
    expect(await store.answer('q1', 'Brazil')).toEqual({ kind: 'error' })
    expect(store.getState().solved).toEqual({})
    expect(store.getState().tries).toEqual({ q1: 1 })
    expect(balances).toEqual([])
  })

  it('treats a thrown claim like a failed one', async () => {
    const claim = vi.fn(async () => {
      throw new Error('offline')
    })
    const { deps } = makeDeps({ status: 'signedIn', claim })
    const store = createLevelStore(deps)

    expect(await store.answer('q1', 'Brazil')).toEqual({ kind: 'error' })
    expect(store.getState().solved).toEqual({})
  })
})
