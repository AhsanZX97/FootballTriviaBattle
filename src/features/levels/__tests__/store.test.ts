import { describe, expect, it, vi } from 'vitest'
import { createLevelStore } from '../store'
import type { ClaimQuestionResponse, LevelsApi } from '../../../services/levels'
import type { LevelDef } from '../../../game/levels/manifest'

const QUESTIONS: Record<string, { correctAnswer: string }> = {
  q1: { correctAnswer: 'Brazil' },
  q2: { correctAnswer: 'Spain' },
  q3: { correctAnswer: 'Pele' },
}

const LEVELS: LevelDef[] = [
  { level: 1, title: 'ONE', questionIds: ['q1', 'q2'], prize: { kind: 'item', itemId: 'goal_horn' } },
  { level: 2, title: 'TWO', questionIds: ['q3'], prize: { kind: 'coins', coins: 50 } },
]

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
    api?: Partial<LevelsApi>
    storage?: ReturnType<typeof memoryStorage>
    owned?: string[]
  } = {},
) {
  const balances: number[] = []
  const localCoins: number[] = []
  const granted: string[] = []
  const owned = new Set(opts.owned ?? [])
  let status = opts.status ?? 'signedOut'
  const authListeners = new Set<() => void>()
  const signInTasks: Array<() => Promise<void>> = []
  const api: LevelsApi = {
    claimQuestion:
      opts.claim ??
      vi.fn(async (_id: string, tries: number): Promise<ClaimQuestionResponse> => ({
        status: 'ok',
        coinsPaid: Math.max(1, 3 - tries),
        coins: 100 + Math.max(1, 3 - tries),
      })),
    claimPrize: vi.fn(async () => ({ status: 'ok' as const, itemId: 'goal_horn', coinsPaid: 0, coins: 106 })),
    listProgress: vi.fn(async () => ({ solved: {}, prizes: [] })),
    importProgress: vi.fn(async () => ({ solved: {}, prizes: [] })),
    ...opts.api,
  }
  const storage = opts.storage ?? memoryStorage()
  const recordAnswer = vi.fn()
  const track = vi.fn()
  const deps = {
    api,
    storage,
    levels: LEVELS,
    auth: {
      getState: () => ({ status }),
      applyCoinsUpdate: (b: number) => void balances.push(b),
      subscribe: (l: () => void) => {
        authListeners.add(l)
        return () => void authListeners.delete(l)
      },
      addSignInTask: (task: () => Promise<void>) => void signInTasks.push(task),
    },
    progress: {
      addCoins: (n: number) => void localCoins.push(n),
      owns: (id: string) => owned.has(id),
      grantItem: (id: string) => {
        if (owned.has(id)) return false
        owned.add(id)
        granted.push(id)
        return true
      },
    },
    challenges: { recordAnswer },
    track,
    priceOf: (id: string) => (id === 'goal_horn' ? 100 : undefined),
    findQuestion: (id: string) => QUESTIONS[id],
  }
  const setStatus = (next: string) => {
    status = next
    authListeners.forEach((l) => l())
  }
  const signIn = async () => {
    setStatus('signedIn')
    for (const task of signInTasks) await task()
  }
  return { deps, api, storage, balances, localCoins, granted, recordAnswer, track, setStatus, signIn }
}

async function solveLevel1(store: ReturnType<typeof createLevelStore>) {
  await store.answer('q1', 'Brazil')
  await store.answer('q2', 'Spain')
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
    const corrupt = memoryStorage({
      'ftb.levels': '{"solved":{"q1":"lots","q2":-1},"tries":[1],"prizes":["1",2.5]}',
    })
    expect(createLevelStore(makeDeps({ storage: corrupt }).deps).getState()).toEqual({
      solved: {},
      tries: {},
      prizes: [],
    })

    const garbage = memoryStorage({ 'ftb.levels': 'not json' })
    expect(createLevelStore(makeDeps({ storage: garbage }).deps).getState()).toEqual({
      solved: {},
      tries: {},
      prizes: [],
    })
  })

  it('reads a Phase 1 file that has no prizes yet', () => {
    const old = memoryStorage({ 'ftb.levels': '{"solved":{"q1":0},"tries":{}}' })
    expect(createLevelStore(makeDeps({ storage: old }).deps).getState().prizes).toEqual([])
  })

  it('remembers claimed prizes across a restart', async () => {
    const storage = memoryStorage()
    const first = createLevelStore(makeDeps({ storage }).deps)
    await solveLevel1(first)
    await first.claimPrize(1)

    expect(createLevelStore(makeDeps({ storage }).deps).getState().prizes).toEqual([1])
  })
})

describe('level store — side effects of a solve', () => {
  it('counts a first solve toward the daily answer challenge, a repeat does not', async () => {
    const { deps, recordAnswer } = makeDeps()
    const store = createLevelStore(deps)

    await store.answer('q1', 'Italy')
    await store.answer('q1', 'Brazil')
    await store.answer('q1', 'Brazil')
    expect(recordAnswer).toHaveBeenCalledTimes(1)
    expect(recordAnswer).toHaveBeenCalledWith(true, false)
  })

  it('reports the solve, and the level when its last card falls', async () => {
    const { deps, track } = makeDeps()
    const store = createLevelStore(deps)

    await store.answer('q1', 'Italy')
    await store.answer('q1', 'Brazil')
    expect(track).toHaveBeenCalledWith('level_question_answered', { level: 1, wrongTries: 1 })
    expect(track).not.toHaveBeenCalledWith('level_completed', expect.anything())

    await store.answer('q2', 'Spain')
    expect(track).toHaveBeenCalledWith('level_completed', { level: 1 })
  })
})

describe('level store — prizes, signed out', () => {
  it('refuses a prize until every card is solved', async () => {
    const { deps, granted } = makeDeps()
    const store = createLevelStore(deps)

    await store.answer('q1', 'Brazil')
    expect(await store.claimPrize(1)).toEqual({ kind: 'error' })
    expect(granted).toEqual([])
    expect(store.getState().prizes).toEqual([])
  })

  it('grants the item for free on a finished level', async () => {
    const { deps, granted, localCoins, track } = makeDeps()
    const store = createLevelStore(deps)
    await solveLevel1(store)
    localCoins.length = 0

    expect(await store.claimPrize(1)).toEqual({ kind: 'item', itemId: 'goal_horn' })
    expect(granted).toEqual(['goal_horn'])
    expect(localCoins).toEqual([])
    expect(store.getState().prizes).toEqual([1])
    expect(track).toHaveBeenCalledWith('level_prize_claimed', { level: 1, kind: 'item' })
  })

  it('pays the shop price when the item is already owned', async () => {
    const { deps, granted, localCoins } = makeDeps({ owned: ['goal_horn'] })
    const store = createLevelStore(deps)
    await solveLevel1(store)
    localCoins.length = 0

    expect(await store.claimPrize(1)).toEqual({ kind: 'coins', coins: 100, itemId: 'goal_horn' })
    expect(granted).toEqual([])
    expect(localCoins).toEqual([100])
  })

  it('pays a chest in coins', async () => {
    const { deps, localCoins } = makeDeps()
    const store = createLevelStore(deps)
    await store.answer('q3', 'Pele')
    localCoins.length = 0

    expect(await store.claimPrize(2)).toEqual({ kind: 'coins', coins: 50 })
    expect(localCoins).toEqual([50])
  })

  it('never pays a prize twice', async () => {
    const { deps, granted } = makeDeps()
    const store = createLevelStore(deps)
    await solveLevel1(store)

    await store.claimPrize(1)
    expect(await store.claimPrize(1)).toEqual({ kind: 'already' })
    expect(granted).toEqual(['goal_horn'])
  })

  it('refuses a level it does not know', async () => {
    const { deps } = makeDeps()
    expect(await createLevelStore(deps).claimPrize(9)).toEqual({ kind: 'error' })
  })
})

describe('level store — prizes, signed in', () => {
  it('claims through the server and banks the new balance', async () => {
    const { deps, api, balances, granted } = makeDeps({ status: 'signedIn' })
    const store = createLevelStore(deps)
    await solveLevel1(store)

    expect(await store.claimPrize(1)).toEqual({ kind: 'item', itemId: 'goal_horn' })
    expect(api.claimPrize).toHaveBeenCalledWith(1)
    expect(balances.at(-1)).toBe(106)
    expect(granted).toEqual([])
    expect(store.getState().prizes).toEqual([1])
  })

  it('shows the coin fallback the server chose for an owned item', async () => {
    const claimPrize = vi.fn(async () => ({ status: 'ok' as const, itemId: null, coinsPaid: 100, coins: 206 }))
    const { deps, balances } = makeDeps({ status: 'signedIn', api: { claimPrize } })
    const store = createLevelStore(deps)
    await solveLevel1(store)

    expect(await store.claimPrize(1)).toEqual({ kind: 'coins', coins: 100, itemId: 'goal_horn' })
    expect(balances.at(-1)).toBe(206)
  })

  it('marks a prize the server already paid as claimed', async () => {
    const claimPrize = vi.fn(async () => ({
      status: 'already_claimed' as const,
      itemId: null,
      coinsPaid: 0,
      coins: 90,
    }))
    const { deps } = makeDeps({ status: 'signedIn', api: { claimPrize } })
    const store = createLevelStore(deps)
    await solveLevel1(store)

    expect(await store.claimPrize(1)).toEqual({ kind: 'already' })
    expect(store.getState().prizes).toEqual([1])
  })

  it('leaves the prize claimable when the server call fails', async () => {
    const claimPrize = vi.fn(async () => null)
    const { deps } = makeDeps({ status: 'signedIn', api: { claimPrize } })
    const store = createLevelStore(deps)
    await solveLevel1(store)

    expect(await store.claimPrize(1)).toEqual({ kind: 'error' })
    expect(store.getState().prizes).toEqual([])
  })
})

describe('level store — signing in and out', () => {
  it('imports offline progress on sign-in, then mirrors the account', async () => {
    const importProgress = vi.fn(async () => ({ solved: { q1: 0, q2: 1, q3: 0 }, prizes: [1] }))
    const { deps, api, signIn } = makeDeps({ api: { importProgress } })
    const store = createLevelStore(deps)
    await solveLevel1(store)
    await store.claimPrize(1)
    await store.answer('q3', 'Wrong')

    await signIn()

    expect(api.importProgress).toHaveBeenCalledWith({ q1: 0, q2: 0 }, [1])
    expect(store.getState()).toEqual({ solved: { q1: 0, q2: 1, q3: 0 }, tries: {}, prizes: [1] })
  })

  it('just loads the account when the device has nothing to import', async () => {
    const listProgress = vi.fn(async () => ({ solved: { q3: 2 }, prizes: [] }))
    const { deps, api, signIn } = makeDeps({ api: { listProgress } })
    const store = createLevelStore(deps)

    await signIn()

    expect(api.importProgress).not.toHaveBeenCalled()
    expect(store.getState().solved).toEqual({ q3: 2 })
  })

  it('keeps local progress when the sign-in sync fails, to retry next time', async () => {
    const importProgress = vi.fn(async () => null)
    const { deps, signIn } = makeDeps({ api: { importProgress } })
    const store = createLevelStore(deps)
    await store.answer('q1', 'Brazil')

    await signIn()

    expect(store.getState().solved).toEqual({ q1: 0 })
  })

  it('wipes the account mirror on sign-out, so it cannot leak into the next account', async () => {
    const listProgress = vi.fn(async () => ({ solved: { q1: 0 }, prizes: [1] }))
    const { deps, signIn, setStatus } = makeDeps({ api: { listProgress } })
    const store = createLevelStore(deps)
    await signIn()

    setStatus('signedOut')

    expect(store.getState()).toEqual({ solved: {}, tries: {}, prizes: [] })
  })

  it('keeps signed-out progress through the boot-time loading -> signedOut step', async () => {
    const { deps, setStatus } = makeDeps({ status: 'loading' })
    const store = createLevelStore(deps)
    await store.answer('q1', 'Brazil')

    setStatus('signedOut')

    expect(store.getState().solved).toEqual({ q1: 0 })
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
