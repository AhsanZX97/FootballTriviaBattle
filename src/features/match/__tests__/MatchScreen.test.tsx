import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import type { Question } from '../../../types/trivia'
import type { ClientMessage, ServerMessage } from '../../../types/multiplayer'
import type { MultiplayerSocket } from '../../../services/multiplayer/socket'

const sample: Question[] = Array.from({ length: 4 }, (_, i) => ({
  id: `q${i}`,
  prompt: `Question ${i}?`,
  correctAnswer: 'Right',
  answers: ['Right', 'Wrong 1', 'Wrong 2', 'Wrong 3'],
  difficulty: 'easy',
  category: 'Sports',
}))

import { matchStore, QUESTION_TIME_SECONDS } from '../store'
import { MatchScreen, FEEDBACK_MS } from '../MatchScreen'
import { authStore } from '../../auth/store'

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
  vi.useFakeTimers()
  matchStore.reset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('MatchScreen', () => {
  it('shows the question, answers, scores and stage label on my turn', () => {
    startMatch()
    render(<MatchScreen />)
    expect(screen.getByText('Question 0?')).toBeDefined()
    expect(screen.getAllByRole('button')).toHaveLength(4)
    expect(screen.getByText(/your kick/i)).toBeDefined()
  })

  it('shows GOAL feedback, then sends the kick and scores on the server echo', () => {
    const match = startMatch()
    render(<MatchScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Right' }))
    expect(screen.getByText(/goal!/i)).toBeDefined()
    // keeper picks a random reaction to being beaten
    expect(document.querySelector('.scene')?.className).toMatch(/scene--goal-(wrong-way|frozen|late)/)
    expect(matchStore.getState().shootout.userScore).toBe(0) // not resolved yet
    act(() => vi.advanceTimersByTime(FEEDBACK_MS))
    expect(match.sent).toContainEqual({ type: 'kickResult', scored: true })
    // the server's echo is what actually moves the scoreboard
    match.emit({ type: 'kickResolved', by: 'you', scored: true })
    expect(matchStore.getState().shootout.userScore).toBe(1)
    expect(screen.getByText(/bob's kick/i)).toBeDefined()
  })

  it('treats a wrong answer as a miss', () => {
    const match = startMatch()
    render(<MatchScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Wrong 1' }))
    expect(screen.getByText(/miss!/i)).toBeDefined()
    act(() => vi.advanceTimersByTime(FEEDBACK_MS))
    expect(match.sent).toContainEqual({ type: 'kickResult', scored: false })
    match.emit({ type: 'kickResolved', by: 'you', scored: false })
    const { shootout } = matchStore.getState()
    expect(shootout.userScore).toBe(0)
    expect(shootout.kicks[0].correct).toBe(false)
  })

  it('sends a miss when the timer runs out on my kick', () => {
    const match = startMatch()
    render(<MatchScreen />)
    // each 1s tick schedules the next from an effect, so flush tick by tick
    for (let i = 0; i < QUESTION_TIME_SECONDS; i++) act(() => vi.advanceTimersByTime(1000))
    act(() => vi.advanceTimersByTime(FEEDBACK_MS))
    expect(match.sent).toContainEqual({ type: 'kickResult', scored: false })
  })

  it('swaps to the animation screen while feedback plays, then back to the question', () => {
    const match = startMatch()
    render(<MatchScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Right' }))
    // animation screen: question and answers are gone
    expect(screen.queryByText('Question 0?')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText(/goal!/i)).toBeDefined()
    act(() => vi.advanceTimersByTime(FEEDBACK_MS))
    // my kick, then Bob's, and the next question screen is mine again
    match.emit({ type: 'kickResolved', by: 'you', scored: true })
    match.emit({ type: 'kickResolved', by: 'opponent', scored: false })
    act(() => vi.advanceTimersByTime(FEEDBACK_MS))
    expect(screen.getByText('Question 2?')).toBeDefined()
    expect(screen.getAllByRole('button')).toHaveLength(4)
  })

  it('shows WIN and the final score when the match is won', () => {
    const match = startMatch()
    for (let i = 0; i < 5; i++) {
      match.emit({ type: 'kickResolved', by: 'you', scored: true })
      match.emit({ type: 'kickResolved', by: 'opponent', scored: false })
    }
    render(<MatchScreen />)
    expect(screen.getByText(/you win/i)).toBeDefined()
    expect(screen.getByText('5 – 0')).toBeDefined()
    expect(screen.getByRole('button', { name: /rematch/i })).toBeDefined()
  })

  it('shows LOSE when the opponent wins', () => {
    const match = startMatch()
    for (let i = 0; i < 5; i++) {
      match.emit({ type: 'kickResolved', by: 'you', scored: false })
      match.emit({ type: 'kickResolved', by: 'opponent', scored: true })
    }
    render(<MatchScreen />)
    expect(screen.getByText(/you lose/i)).toBeDefined()
    expect(screen.getByText('0 – 5')).toBeDefined()
  })

  it('leaves the match and goes to the main menu from the result screen', () => {
    const match = startMatch()
    for (let i = 0; i < 5; i++) {
      match.emit({ type: 'kickResolved', by: 'you', scored: true })
      match.emit({ type: 'kickResolved', by: 'opponent', scored: false })
    }
    const onMainMenu = vi.fn()
    render(<MatchScreen onMainMenu={onMainMenu} />)
    fireEvent.click(screen.getByRole('button', { name: /main menu/i }))
    expect(match.close).toHaveBeenCalled()
    expect(onMainMenu).toHaveBeenCalled()
  })

  it('shows MATCH ABANDONED, not YOU LOSE, when the opponent leaves a level match', () => {
    const match = startMatch()
    // level 1-1 mid-match, then Bob quits
    match.emit({ type: 'kickResolved', by: 'you', scored: true })
    match.emit({ type: 'kickResolved', by: 'opponent', scored: true })
    match.emit({ type: 'opponentLeft' })
    render(<MatchScreen />)
    expect(screen.getByText(/match abandoned/i)).toBeDefined()
    expect(screen.queryByText(/you lose/i)).toBeNull()
    expect(screen.getByText('1 – 1')).toBeDefined()
    expect(screen.getByText(/bob left/i)).toBeDefined()
  })

  it('keeps the equipped GK skin during the opponent-kick feedback while defending', () => {
    authStore.applyCustomizationUpdate('gkSkin', 'gk_green_wall')
    const match = startMatch({ youGoFirst: false })
    render(<MatchScreen />)
    // opponent kicks while we defend: the store flips stage to 'shoot' at once,
    // but the animation depicts the 'keep' kick, so our keeper stays skinned
    match.emit({ type: 'kickResolved', by: 'opponent', scored: false })
    expect(screen.getByText(/saved!/i)).toBeDefined()
    expect(document.querySelector('.scene__keeper')?.className).toContain('scene__keeper--skinned')
    authStore.applyCustomizationUpdate('gkSkin', 'default')
  })

  it('lifts the dark overlay while spectating the opponent', () => {
    startMatch({ youGoFirst: false })
    render(<MatchScreen />)
    expect(screen.getByText(/waiting for bob/i)).toBeDefined()
    expect(document.querySelector('main.match')?.className).toContain('match--scene')
  })

  it('offers a way back to the lobby if the session arrives with no questions', () => {
    startMatch({ questions: [] })
    const onExit = vi.fn()
    render(<MatchScreen onExit={onExit} />)
    expect(screen.getByText(/couldn't load/i)).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: /lobby/i }))
    expect(onExit).toHaveBeenCalled()
  })
})
