import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { PitchCallbacks, PitchState } from '../../match/engine/contracts'

const engine = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), destroy: vi.fn() }))
vi.mock('../../match/engine/loadPitchGame', () => ({
  loadPitchGame: async () => ({ createPitchGame: engine.create }),
}))
vi.mock('../../../services/sound', () => ({
  play: vi.fn(),
  playGoalCelebration: vi.fn(),
  fadeOutCrowd: vi.fn(),
}))

import { LEVELS } from '../../../game/levels/manifest'
import { footballBank } from '../../../services/trivia/bank'
import { createLevelStore } from '../store'
import type { ClaimQuestionResponse, LevelsApi } from '../../../services/levels'
import { LevelQuestion } from '../LevelQuestion'
import { play, playGoalCelebration } from '../../../services/sound'

// wc-1: "Which country has won the most FIFA World Cups?" -> Brazil
const QID = 'wc-1'

let pitch: PitchState
let callbacks: PitchCallbacks

beforeEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  engine.create.mockImplementation((_host: HTMLElement, state: PitchState, events: PitchCallbacks) => {
    pitch = state
    callbacks = events
    return { update: engine.update, destroy: engine.destroy }
  })
  engine.update.mockImplementation((state: PitchState) => {
    pitch = state
  })
})

function memoryStorage() {
  const data: Record<string, string> = {}
  return {
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => void (data[k] = v),
    removeItem: (k: string) => void delete data[k],
  }
}

function makeStore(opts: { status?: string; claim?: LevelsApi['claimQuestion'] } = {}) {
  const addCoins = vi.fn()
  const store = createLevelStore({
    api: {
      claimQuestion: opts.claim ?? vi.fn(async () => null),
      claimPrize: vi.fn(async () => null),
      listProgress: vi.fn(async () => null),
      importProgress: vi.fn(async () => null),
    },
    auth: { getState: () => ({ status: opts.status ?? 'signedOut' }), applyCoinsUpdate: vi.fn() },
    progress: { addCoins, owns: () => false, grantItem: () => true },
    challenges: { recordAnswer: vi.fn() },
    track: vi.fn(),
    storage: memoryStorage(),
  })
  return { store, addCoins }
}

async function mount(
  store: ReturnType<typeof makeStore>['store'],
  onBack = () => {},
  onNext = () => {},
  questionId = QID,
) {
  render(<LevelQuestion questionId={questionId} store={store} onBack={onBack} onNext={onNext} />)
  await act(async () => {})
}

async function pick(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
  })
}

function finishShot() {
  expect(pitch.feedback).not.toBeNull()
  act(() => callbacks.onEvent('complete', pitch.feedback!))
}

describe('LevelQuestion', () => {
  it('shows the prompt and its four answers over a dimmed pitch', async () => {
    const { store } = makeStore()
    await mount(store)

    expect(screen.getByText(/won the most FIFA World Cups/i)).toBeDefined()
    for (const answer of ['Brazil', 'Germany', 'Italy', 'Argentina']) {
      expect(screen.getByRole('button', { name: answer })).toBeDefined()
    }
    expect(screen.getByLabelText('Worth 3 coins')).toBeDefined()
    expect(pitch.dimmed).toBe(true)
    expect(pitch.feedback).toBeNull()
  })

  it('plays a saved penalty on a wrong answer when the roll lands low', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.2)
    const { store } = makeStore()
    await mount(store)

    await pick('Italy')
    expect(pitch.feedback).toBe('save')

    act(() => callbacks.onEvent('impact', 'save'))
    expect(play).toHaveBeenCalledWith('shock')
    finishShot()
    expect(screen.getByText('WRONG! TRY AGAIN')).toBeDefined()
  })

  it('plays a missed penalty on a wrong answer, then shows the question again', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.8)
    const { store } = makeStore()
    await mount(store)

    await pick('Italy')
    expect(pitch.feedback).toBe('miss')
    expect(pitch.dimmed).toBe(false)
    expect(screen.queryByText(/won the most FIFA World Cups/i)).toBeNull()

    act(() => callbacks.onEvent('impact', 'miss'))
    expect(play).toHaveBeenCalledWith('shock')

    finishShot()
    expect(pitch.feedback).toBeNull()
    expect(screen.getByText(/won the most FIFA World Cups/i)).toBeDefined()
    expect(screen.getByText('WRONG! TRY AGAIN')).toBeDefined()
    expect((screen.getByRole('button', { name: 'Italy' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Brazil' }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByLabelText('Worth 2 coins')).toBeDefined()
  })

  it('scores a penalty on the right answer, then shows the coins and Continue', async () => {
    const { store, addCoins } = makeStore()
    const onBack = vi.fn()
    const onNext = vi.fn()
    await mount(store, onBack, onNext)

    await pick('Italy')
    finishShot()
    await pick('Brazil')
    expect(pitch.feedback).toBe('goal')
    expect(screen.queryByRole('button', { name: 'CONTINUE' })).toBeNull()

    act(() => callbacks.onEvent('impact', 'goal'))
    expect(playGoalCelebration).toHaveBeenCalledOnce()

    finishShot()
    expect(screen.getByText('CORRECT!')).toBeDefined()
    expect(screen.getByRole('status', { name: 'You earned 2 coins' })).toBeDefined()
    expect(addCoins).toHaveBeenCalledWith(2)

    fireEvent.click(screen.getByRole('button', { name: 'CONTINUE' }))
    const ids = LEVELS[0].questionIds
    expect(onNext).toHaveBeenCalledWith(ids[ids.indexOf(QID) + 1])
    expect(onBack).not.toHaveBeenCalled()
  })

  it('leaves the level when Continue is on the last unsolved card', async () => {
    const { store } = makeStore()
    const onBack = vi.fn()
    const onNext = vi.fn()
    const lastId = LEVELS[0].questionIds.at(-1)!
    const last = footballBank.find((q) => q.id === lastId)!
    await mount(store, onBack, onNext, lastId)

    await pick(last.correctAnswer)
    finishShot()
    fireEvent.click(screen.getByRole('button', { name: 'CONTINUE' }))
    expect(onBack).toHaveBeenCalled()
    expect(onNext).not.toHaveBeenCalled()
  })

  it('says a solved card pays nothing when answered again', async () => {
    const { store, addCoins } = makeStore()
    await store.answer(QID, 'Brazil')
    addCoins.mockClear()
    await mount(store)

    expect(screen.getByText('SOLVED')).toBeDefined()
    await pick('Brazil')
    finishShot()
    expect(screen.getByText('ALREADY SOLVED, NO COINS')).toBeDefined()
    expect(screen.queryByRole('status', { name: /you earned/i })).toBeNull()
    expect(addCoins).not.toHaveBeenCalled()
  })

  it('skips the penalty and lets the player retry when a signed-in claim fails', async () => {
    const { store } = makeStore({ status: 'signedIn', claim: vi.fn(async () => null) })
    await mount(store)

    await pick('Brazil')
    expect(pitch.feedback).toBeNull()
    expect(screen.getByText("COULDN'T SAVE. TRY AGAIN")).toBeDefined()
    expect((screen.getByRole('button', { name: 'Brazil' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('shows the coins the server actually paid', async () => {
    const claim = vi.fn(async (): Promise<ClaimQuestionResponse> => ({ status: 'ok', coinsPaid: 3, coins: 50 }))
    const { store } = makeStore({ status: 'signedIn', claim })
    await mount(store)

    await pick('Brazil')
    finishShot()
    expect(screen.getByRole('status', { name: 'You earned 3 coins' })).toBeDefined()
  })
})
