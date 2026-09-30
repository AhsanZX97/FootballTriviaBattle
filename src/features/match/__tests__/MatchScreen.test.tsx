import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import type { Question } from '../../../types/trivia'
import type { ClientMessage, ServerMessage } from '../../../types/multiplayer'
import type { MultiplayerSocket } from '../../../services/multiplayer/socket'
import type { PitchCallbacks, PitchState } from '../engine/contracts'
import { resolvePitchArt } from '../engine/pitchArt'

const engine = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), destroy: vi.fn() }))
vi.mock('../engine/loadPitchGame', () => ({ loadPitchGame: async () => ({ createPitchGame: engine.create }) }))
vi.mock('../../../services/sound', () => ({
  play: vi.fn(), playGoalCelebration: vi.fn(), fadeOutCrowd: vi.fn(),
}))

const sample: Question[] = Array.from({ length: 4 }, (_, i) => ({
  id: `q${i}`,
  prompt: `Question ${i}?`,
  correctAnswer: 'Right',
  answers: ['Right', 'Wrong 1', 'Wrong 2', 'Wrong 3'],
  difficulty: 'easy',
  category: 'Sports',
}))

import { matchStore, QUESTION_TIME_SECONDS } from '../store'
import { MatchScreen } from '../MatchScreen'
import { FEEDBACK_MS } from '../engine/shotTimeline'
import { authStore } from '../../auth/store'
import { play, playGoalCelebration } from '../../../services/sound'

let pitch: PitchState
let callbacks: PitchCallbacks
async function mount(props: Parameters<typeof MatchScreen>[0] = {}) {
  const view = render(<MatchScreen {...props} />)
  await act(async () => {})
  return view
}

function finishShot() {
  expect(pitch.feedback).not.toBeNull()
  act(() => callbacks.onEvent('complete', pitch.feedback!))
}

/** A live match against Bob, with hooks to drive the server side of it. */
function startMatch(overrides: { youGoFirst?: boolean; questions?: Question[] } = {}) {
  const handlers: Array<(m: ServerMessage) => void> = []
  const sent: ClientMessage[] = []
  const close = vi.fn()
  const socket: MultiplayerSocket = {
    send: (m) => void sent.push(m),
    onMessage: (h) => {
      handlers.push(h)
      return () => {}
    },
    onClose: () => () => {},
    close,
  }
  matchStore.start1v1({
    socket,
    opponentName: 'Bob',
    opponentGkSkin: null,
    youGoFirst: overrides.youGoFirst ?? true,
    questions: overrides.questions ?? sample,
  })
  return {
    sent,
    close,
    emit: (m: ServerMessage) => act(() => void handlers.forEach((h) => h(m))),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  engine.create.mockImplementation((_parent: HTMLElement, state: PitchState, events: PitchCallbacks) => {
    pitch = state
    callbacks = events
    return { update: engine.update, destroy: engine.destroy }
  })
  engine.update.mockImplementation((state: PitchState) => { pitch = state })
  vi.useFakeTimers()
  matchStore.reset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('MatchScreen', () => {
  it('keeps one pitch engine across questions and waits for its completion event', async () => {
    const match = startMatch()
    const view = await mount()
    expect(engine.create).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Right' }))
    act(() => vi.advanceTimersByTime(FEEDBACK_MS + 1000))
    expect(match.sent).not.toContainEqual({ type: 'kickResult', scored: true })
    finishShot()
    expect(match.sent).toContainEqual({ type: 'kickResult', scored: true })
    expect(engine.create).toHaveBeenCalledOnce()
    view.unmount()
    expect(engine.destroy).toHaveBeenCalledOnce()
  })

  it('plays launch and goal sounds on engine cues', async () => {
    startMatch()
    await mount()
    fireEvent.click(screen.getByRole('button', { name: 'Right' }))
    act(() => callbacks.onEvent('kick', 'goal'))
    expect(play).toHaveBeenCalledWith('kick')
    act(() => callbacks.onEvent('impact', 'goal'))
    expect(play).toHaveBeenCalledWith('netRipple')
    expect(playGoalCelebration).toHaveBeenCalledOnce()
  })

  it('shows the question, answers, scores and stage label on my turn', async () => {
    startMatch()
    await mount()
    expect(screen.getByText('Question 0?')).toBeDefined()
    expect(screen.getAllByRole('button')).toHaveLength(4)
    expect(screen.getByText(/your kick/i)).toBeDefined()
  })

  it('shows GOAL feedback, then sends the kick and scores on the server echo', async () => {
    const match = startMatch()
    await mount()
    fireEvent.click(screen.getByRole('button', { name: 'Right' }))
    expect(screen.getByText(/goal!/i)).toBeDefined()
    expect(pitch.feedback).toBe('goal')
    expect(matchStore.getState().shootout.userScore).toBe(0) // not resolved yet
    finishShot()
    expect(match.sent).toContainEqual({ type: 'kickResult', scored: true })
    // the server's echo is what actually moves the scoreboard
    match.emit({ type: 'kickResolved', by: 'you', scored: true })
    expect(matchStore.getState().shootout.userScore).toBe(1)
    expect(screen.getByText(/bob's kick/i)).toBeDefined()
  })

  it('treats a wrong answer as a miss', async () => {
    const match = startMatch()
    await mount()
    fireEvent.click(screen.getByRole('button', { name: 'Wrong 1' }))
    expect(screen.getByText(/miss!/i)).toBeDefined()
    finishShot()
    expect(match.sent).toContainEqual({ type: 'kickResult', scored: false })
    match.emit({ type: 'kickResolved', by: 'you', scored: false })
    const { shootout } = matchStore.getState()
    expect(shootout.userScore).toBe(0)
    expect(shootout.kicks[0].correct).toBe(false)
  })

  it('sends a miss when the timer runs out on my kick', async () => {
    const match = startMatch()
    await mount()
    // each 1s tick schedules the next from an effect, so flush tick by tick
    for (let i = 0; i < QUESTION_TIME_SECONDS; i++) act(() => vi.advanceTimersByTime(1000))
    finishShot()
    expect(match.sent).toContainEqual({ type: 'kickResult', scored: false })
  })

  it('swaps to the animation screen while feedback plays, then back to the question', async () => {
    const match = startMatch()
    await mount()
    fireEvent.click(screen.getByRole('button', { name: 'Right' }))
    // animation screen: question and answers are gone
    expect(screen.queryByText('Question 0?')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText(/goal!/i)).toBeDefined()
    finishShot()
    // my kick, then Bob's, and the next question screen is mine again
    match.emit({ type: 'kickResolved', by: 'you', scored: true })
    match.emit({ type: 'kickResolved', by: 'opponent', scored: false })
    finishShot()
    expect(screen.getByText('Question 2?')).toBeDefined()
    expect(screen.getAllByRole('button')).toHaveLength(4)
  })

  it('shows WIN and the final score when the match is won', async () => {
    const match = startMatch()
    for (let i = 0; i < 5; i++) {
      match.emit({ type: 'kickResolved', by: 'you', scored: true })
      match.emit({ type: 'kickResolved', by: 'opponent', scored: false })
    }
    await mount()
    expect(screen.getByText(/you win/i)).toBeDefined()
    expect(screen.getByText('5 – 0')).toBeDefined()
    expect(screen.getByRole('button', { name: /rematch/i })).toBeDefined()
  })

  it('shows LOSE when the opponent wins', async () => {
    const match = startMatch()
    for (let i = 0; i < 5; i++) {
      match.emit({ type: 'kickResolved', by: 'you', scored: false })
      match.emit({ type: 'kickResolved', by: 'opponent', scored: true })
    }
    await mount()
    expect(screen.getByText(/you lose/i)).toBeDefined()
    expect(screen.getByText('0 – 5')).toBeDefined()
  })

  it('leaves the match and goes to the main menu from the result screen', async () => {
    const match = startMatch()
    for (let i = 0; i < 5; i++) {
      match.emit({ type: 'kickResolved', by: 'you', scored: true })
      match.emit({ type: 'kickResolved', by: 'opponent', scored: false })
    }
    const onMainMenu = vi.fn()
    await mount({ onMainMenu })
    fireEvent.click(screen.getByRole('button', { name: /main menu/i }))
    expect(match.close).toHaveBeenCalled()
    expect(onMainMenu).toHaveBeenCalled()
  })

  it('shows MATCH ABANDONED, not YOU LOSE, when the opponent leaves a level match', async () => {
    const match = startMatch()
    // level 1-1 mid-match, then Bob quits
    match.emit({ type: 'kickResolved', by: 'you', scored: true })
    match.emit({ type: 'kickResolved', by: 'opponent', scored: true })
    match.emit({ type: 'opponentLeft' })
    await mount()
    expect(screen.getByText(/match abandoned/i)).toBeDefined()
    expect(screen.queryByText(/you lose/i)).toBeNull()
    expect(screen.getByText('1 – 1')).toBeDefined()
    expect(screen.getByText(/bob left/i)).toBeDefined()
  })

  it('keeps the equipped GK skin during the opponent-kick feedback while defending', async () => {
    authStore.applyCustomizationUpdate('gkSkin', 'gk_green_wall')
    const match = startMatch({ youGoFirst: false })
    await mount()
    // opponent kicks while we defend: the store flips stage to 'shoot' at once,
    // but the animation depicts the 'keep' kick, so our keeper stays skinned
    match.emit({ type: 'kickResolved', by: 'opponent', scored: false })
    expect(screen.getByText(/saved!/i)).toBeDefined()
    expect(resolvePitchArt(pitch).idle.src).toContain('green-wall.png')
    authStore.applyCustomizationUpdate('gkSkin', 'default')
  })

  it('lifts the dark overlay while spectating the opponent', async () => {
    startMatch({ youGoFirst: false })
    await mount()
    expect(screen.getByText(/waiting for bob/i)).toBeDefined()
    expect(document.querySelector('main.match')?.className).toContain('match--scene')
  })

  it('offers a way back to the lobby if the session arrives with no questions', async () => {
    startMatch({ questions: [] })
    const onExit = vi.fn()
    await mount({ onExit })
    expect(screen.getByText(/couldn't load/i)).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: /lobby/i }))
    expect(onExit).toHaveBeenCalled()
  })
})
