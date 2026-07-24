import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createChallengesStore } from '../store'
import type { ChallengeApi } from '../store'
import type { DailyChallengeId } from '../../../types/daily'
import { dailyKey, pickDailyChallenges } from '../../../services/dailyChallenges'

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  }
}

function fakeAuth(status = 'signedIn') {
  return {
    getState: () => ({ status }),
    applyCoinsUpdate: vi.fn(),
  }
}

/** A 2026 date whose active set contains every id in `ids`. With 3 of 4 drawn
 * daily, such a date is common, so the scan finds one quickly. */
function dateWith(...ids: DailyChallengeId[]): Date {
  for (let d = 1; d <= 200; d++) {
    const dt = new Date(2026, 0, d, 12)
    const set = pickDailyChallenges(dailyKey(dt))
    if (ids.every((id) => set.includes(id))) return dt
  }
  throw new Error(`no date found containing ${ids.join(', ')}`)
}

const progressOf = (store: ReturnType<typeof createChallengesStore>, id: DailyChallengeId) =>
  store.getState().challenges.find((c) => c.def.id === id)

describe('challenges store', () => {
  let storage: ReturnType<typeof fakeStorage>
  let auth: ReturnType<typeof fakeAuth>
  let api: ChallengeApi & { claimChallenge: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    storage = fakeStorage()
    auth = fakeAuth()
    api = { claimChallenge: vi.fn(async () => 123) }
  })

  it('starts with three challenges at zero progress', () => {
    const store = createChallengesStore({ storage, auth, api, now: () => dateWith('win_2_cpu') })
    const { challenges } = store.getState()
    expect(challenges).toHaveLength(3)
    challenges.forEach((c) => {
      expect(c.progress).toBe(0)
      expect(c.complete).toBe(false)
      expect(c.claimed).toBe(false)
    })
  })

  it('advances the CPU-win challenge and completes it at the goal', () => {
    const store = createChallengesStore({ storage, auth, api, now: () => dateWith('win_2_cpu') })
    store.recordCpuWin()
    expect(progressOf(store, 'win_2_cpu')?.progress).toBe(1)
    store.recordCpuWin()
    expect(progressOf(store, 'win_2_cpu')).toMatchObject({ progress: 2, complete: true })
  })

  it('counts a scored penalty toward both the answer and penalty challenges', () => {
    const store = createChallengesStore({
      storage,
      auth,
      api,
      now: () => dateWith('answer_15', 'score_5_pens'),
    })
    store.recordAnswer(true, true) // correct + shoot stage = a scored penalty
    expect(progressOf(store, 'answer_15')?.progress).toBe(1)
    expect(progressOf(store, 'score_5_pens')?.progress).toBe(1)

    store.recordAnswer(true, false) // correct save: answer only, not a penalty
    expect(progressOf(store, 'answer_15')?.progress).toBe(2)
    expect(progressOf(store, 'score_5_pens')?.progress).toBe(1)
  })

  it('ignores wrong answers', () => {
    const store = createChallengesStore({
      storage,
      auth,
      api,
      now: () => dateWith('answer_15'),
    })
    store.recordAnswer(false, true)
    expect(progressOf(store, 'answer_15')?.progress).toBe(0)
  })

  it('does not advance past the goal', () => {
    const store = createChallengesStore({ storage, auth, api, now: () => dateWith('win_1v1') })
    store.record1v1Win()
    store.record1v1Win()
    expect(progressOf(store, 'win_1v1')).toMatchObject({ progress: 1, complete: true })
  })

  it('claims a completed challenge, banking the returned balance', async () => {
    const store = createChallengesStore({ storage, auth, api, now: () => dateWith('win_1v1') })
    store.record1v1Win()
    const ok = await store.claim('win_1v1')
    expect(ok).toBe(true)
    expect(api.claimChallenge).toHaveBeenCalledWith('win_1v1')
    expect(auth.applyCoinsUpdate).toHaveBeenCalledWith(123)
    expect(progressOf(store, 'win_1v1')?.claimed).toBe(true)
  })

  it('refuses to claim an incomplete challenge', async () => {
    const store = createChallengesStore({ storage, auth, api, now: () => dateWith('win_2_cpu') })
    const ok = await store.claim('win_2_cpu')
    expect(ok).toBe(false)
    expect(api.claimChallenge).not.toHaveBeenCalled()
  })

  it('refuses to claim when signed out', async () => {
    const store = createChallengesStore({
      storage,
      auth: fakeAuth('signedOut'),
      api,
      now: () => dateWith('win_1v1'),
    })
    store.record1v1Win()
    const ok = await store.claim('win_1v1')
    expect(ok).toBe(false)
    expect(api.claimChallenge).not.toHaveBeenCalled()
  })

  it('marks claimed without banking coins when the server reports already-claimed', async () => {
    const nullApi = { claimChallenge: vi.fn(async () => null) }
    const store = createChallengesStore({ storage, auth, api: nullApi, now: () => dateWith('win_1v1') })
    store.record1v1Win()
    await store.claim('win_1v1')
    expect(progressOf(store, 'win_1v1')?.claimed).toBe(true)
    expect(auth.applyCoinsUpdate).not.toHaveBeenCalled()
  })

  it('persists progress across store instances on the same day', () => {
    const day = () => dateWith('win_2_cpu')
    const first = createChallengesStore({ storage, auth, api, now: day })
    first.recordCpuWin()
    const second = createChallengesStore({ storage, auth, api, now: day })
    expect(progressOf(second, 'win_2_cpu')?.progress).toBe(1)
  })

  it('resets to a fresh, empty set on a new day', () => {
    let current = dateWith('win_2_cpu')
    const store = createChallengesStore({ storage, auth, api, now: () => current })
    store.recordCpuWin()
    expect(progressOf(store, 'win_2_cpu')?.progress).toBe(1)

    current = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1, 12)
    store.refresh()
    // A different day => its own storage key => progress starts at zero again.
    store.getState().challenges.forEach((c) => expect(c.progress).toBe(0))
  })
})
