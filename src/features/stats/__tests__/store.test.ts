import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createStatsStore } from '../store'
import type { StatsApi } from '../../../services/stats'
import type { StatsAuthSeam } from '../store'
import type { MatchHistoryEntry, MatchStats } from '../../../types/stats'

const entry = (over: Partial<MatchHistoryEntry> = {}): MatchHistoryEntry => ({
  mode: '1v1',
  opponentName: 'Bob',
  outcome: 'win',
  userScore: 5,
  opponentScore: 3,
  byDisconnect: false,
  createdAt: '2026-07-24T00:00:00.000Z',
  ...over,
})

function makeApi(stats: MatchStats): { api: StatsApi; fetchStats: ReturnType<typeof vi.fn> } {
  const fetchStats = vi.fn<() => Promise<MatchStats>>().mockResolvedValue(stats)
  return {
    api: { fetchStats },
    fetchStats,
  }
}

const authSeam = (status: string): StatsAuthSeam => ({ getState: () => ({ status }) })


describe('statsStore', () => {
  beforeEach(() => vi.clearAllMocks())

  it('starts idle with an empty record', () => {
    const { api } = makeApi({ wins: 0, losses: 0, recent: [] })
    const store = createStatsStore({ api, auth: authSeam('signedIn') })
    expect(store.getState()).toMatchObject({ status: 'idle', wins: 0, losses: 0, recent: [] })
  })

  it('loads wins, losses, and recent games when signed in', async () => {
    const recent = [entry(), entry({ outcome: 'loss', opponentName: 'CPU', mode: 'cpu' })]
    const { api, fetchStats } = makeApi({ wins: 4, losses: 2, recent })
    const store = createStatsStore({ api, auth: authSeam('signedIn') })

    await store.refresh()

    expect(fetchStats).toHaveBeenCalledOnce()
    expect(store.getState()).toMatchObject({ status: 'loaded', wins: 4, losses: 2, recent })
  })

  it('does not fetch when signed out and resets to an empty loaded record', async () => {
    const { api, fetchStats } = makeApi({ wins: 9, losses: 9, recent: [entry()] })
    const store = createStatsStore({ api, auth: authSeam('signedOut') })

    await store.refresh()

    expect(fetchStats).not.toHaveBeenCalled()
    expect(store.getState()).toMatchObject({ status: 'loaded', wins: 0, losses: 0, recent: [] })
  })

  it('surfaces an error but still ends in the loaded state when the fetch throws', async () => {
    const fetchStats = vi.fn<() => Promise<MatchStats>>().mockRejectedValue(new Error('network'))
    const store = createStatsStore({
      api: { fetchStats },
      auth: authSeam('signedIn'),
    })

    await store.refresh()

    expect(store.getState().status).toBe('loaded')
    expect(store.getState().error).toBeTruthy()
  })

  it('notifies subscribers on state change', async () => {
    const { api } = makeApi({ wins: 1, losses: 0, recent: [] })
    const store = createStatsStore({ api, auth: authSeam('signedIn') })
    const spy = vi.fn()
    const unsub = store.subscribe(spy)

    await store.refresh()

    expect(spy).toHaveBeenCalled()
    unsub()
  })
})
