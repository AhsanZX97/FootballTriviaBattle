import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { createLevelStore, type LevelStore } from '../store'
import { LevelScreen } from '../LevelScreen'
import { LEVELS } from '../../../game/levels/manifest'
import { footballBank } from '../../../services/trivia/bank'
import type { LevelsApi } from '../../../services/levels'

const LEVEL_1 = LEVELS[0].questionIds

function makeStore(opts: { owned?: string[]; status?: string; api?: Partial<LevelsApi> } = {}) {
  const data: Record<string, string> = {}
  const owned = new Set(opts.owned ?? [])
  return createLevelStore({
    api: {
      claimQuestion: vi.fn(async () => null),
      claimPrize: vi.fn(async () => null),
      listProgress: vi.fn(async () => null),
      importProgress: vi.fn(async () => null),
      ...opts.api,
    },
    auth: { getState: () => ({ status: opts.status ?? 'signedOut' }), applyCoinsUpdate: vi.fn() },
    progress: {
      addCoins: vi.fn(),
      owns: (id) => owned.has(id),
      grantItem: (id) => !owned.has(id) && Boolean(owned.add(id)),
    },
    challenges: { recordAnswer: vi.fn() },
    track: vi.fn(),
    storage: {
      getItem: (k) => data[k] ?? null,
      setItem: (k, v) => void (data[k] = v),
      removeItem: (k) => void delete data[k],
    },
  })
}

async function solveAll(store: LevelStore) {
  for (const id of LEVEL_1) await store.answer(id, footballBank.find((q) => q.id === id)!.correctAnswer)
}

describe('LevelScreen', () => {
  it('shows the level title, its progress and all 24 cards', () => {
    render(<LevelScreen level={1} store={makeStore()} onBack={() => {}} onOpen={() => {}} />)

    expect(screen.getByRole('img', { name: 'LEVEL 1' })).toBeDefined()
    expect(screen.getByRole('heading', { name: 'SUNDAY LEAGUE' })).toBeDefined()
    expect(screen.getByText('0/24')).toBeDefined()
    expect(screen.getAllByRole('button', { name: /^question \d+/i })).toHaveLength(24)
  })

  it('shows the prize the level pays', () => {
    render(<LevelScreen level={1} store={makeStore()} onBack={() => {}} onOpen={() => {}} />)

    expect(screen.getByRole('img', { name: 'Prize: goal + horn' })).toBeDefined()
  })

  it('opens the tapped card', () => {
    const onOpen = vi.fn()
    render(<LevelScreen level={1} store={makeStore()} onBack={() => {}} onOpen={onOpen} />)

    fireEvent.click(screen.getByRole('button', { name: 'Question 1' }))
    expect(onOpen).toHaveBeenCalledWith(LEVEL_1[0])
  })

  it('marks a solved card and counts it', async () => {
    const store = makeStore()
    await store.answer(LEVEL_1[0], footballBank.find((q) => q.id === LEVEL_1[0])!.correctAnswer)
    render(<LevelScreen level={1} store={store} onBack={() => {}} onOpen={() => {}} />)

    expect(screen.getByRole('button', { name: 'Question 1, solved' })).toBeDefined()
    expect(screen.getByText('1/24')).toBeDefined()
  })

  it('goes back', () => {
    const onBack = vi.fn()
    render(<LevelScreen level={1} store={makeStore()} onBack={onBack} onOpen={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(onBack).toHaveBeenCalled()
  })
})

describe('LevelScreen — finishing the level', () => {
  it('claims the prize and reveals it, with a way to equip it', async () => {
    const store = makeStore()
    await solveAll(store)
    const equip = vi.fn(async () => true)
    render(<LevelScreen level={1} store={store} equip={equip} onBack={() => {}} onOpen={() => {}} />)

    expect(await screen.findByRole('dialog', { name: 'LEVEL 1 COMPLETE!' })).toBeDefined()
    expect(screen.getByText('goal + horn')).toBeDefined()
    expect(store.getState().prizes).toEqual([1])

    fireEvent.click(screen.getByRole('button', { name: 'EQUIP NOW' }))
    expect(equip).toHaveBeenCalledWith('goalSound', 'goal_horn')
    expect(await screen.findByRole('button', { name: 'EQUIPPED' })).toBeDefined()
  })

  it('pays coins instead when the item is already owned', async () => {
    const store = makeStore({ owned: ['goal_horn'] })
    await solveAll(store)
    render(<LevelScreen level={1} store={store} onBack={() => {}} onOpen={() => {}} />)

    expect(await screen.findByText('You already own goal + horn')).toBeDefined()
    expect(screen.getByRole('status', { name: /100/ })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'EQUIP NOW' })).toBeNull()
  })

  it('closes the reveal', async () => {
    const store = makeStore()
    await solveAll(store)
    render(<LevelScreen level={1} store={store} onBack={() => {}} onOpen={() => {}} />)

    fireEvent.click(await screen.findByRole('button', { name: 'CLOSE' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does not reveal a prize claimed earlier', async () => {
    const store = makeStore()
    await solveAll(store)
    await store.claimPrize(1)
    render(<LevelScreen level={1} store={store} onBack={() => {}} onOpen={() => {}} />)

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('img', { name: 'Prize: goal + horn, claimed' })).toBeDefined()
  })

  it('offers a retry when a signed-in claim fails', async () => {
    const claimPrize = vi
      .fn<LevelsApi['claimPrize']>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ status: 'ok', itemId: 'goal_horn', coinsPaid: 0, coins: 10 })
    const claimQuestion = vi.fn(async () => ({ status: 'ok' as const, coinsPaid: 3, coins: 3 }))
    const store = makeStore({ status: 'signedIn', api: { claimPrize, claimQuestion } })
    await solveAll(store)
    render(<LevelScreen level={1} store={store} onBack={() => {}} onOpen={() => {}} />)

    fireEvent.click(await screen.findByRole('button', { name: 'CLAIM PRIZE' }))
    expect(await screen.findByRole('dialog', { name: 'LEVEL 1 COMPLETE!' })).toBeDefined()
  })
})
