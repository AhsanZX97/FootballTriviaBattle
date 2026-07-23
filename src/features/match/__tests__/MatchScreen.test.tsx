import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import type { Question } from '../../../types/trivia'
import type { ServerMessage } from '../../../types/multiplayer'
import type { MultiplayerSocket } from '../../../services/multiplayer/socket'

const sample: Question[] = Array.from({ length: 4 }, (_, i) => ({
  id: `q${i}`,
  prompt: `Question ${i}?`,
  correctAnswer: 'Right',
  answers: ['Right', 'Wrong 1', 'Wrong 2', 'Wrong 3'],
  difficulty: 'easy',
  category: 'Sports',
}))

const getQuestions = vi.fn<(count: number) => Promise<Question[]>>()
vi.mock('../../../services/trivia/questionSource', () => ({
  getQuestions: (count: number) => getQuestions(count),
}))

import { matchStore, QUESTION_TIME_SECONDS } from '../store'
import { MatchScreen, FEEDBACK_MS } from '../MatchScreen'
import { authStore } from '../../auth/store'

beforeEach(() => {
  vi.useFakeTimers()
  matchStore.reset()
  getQuestions.mockReset()
  getQuestions.mockResolvedValue(sample)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('MatchScreen', () => {
  it('shows the question, answers, scores and stage label when active', async () => {
    await act(() => matchStore.start())
    render(<MatchScreen />)
    expect(screen.getByText('Question 0?')).toBeDefined()
    expect(screen.getAllByRole('button')).toHaveLength(4)
    expect(screen.getByText(/you're shooting/i)).toBeDefined()
  })

  it('shows GOAL feedback, then scores and flips the stage', async () => {
    await act(() => matchStore.start())
    render(<MatchScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Right' }))
    expect(screen.getByText(/goal!/i)).toBeDefined()
    // keeper picks a random reaction to being beaten
    expect(document.querySelector('.scene')?.className).toMatch(/scene--goal-(wrong-way|frozen|late)/)
    expect(matchStore.getState().shootout.userScore).toBe(0) // not resolved yet
    act(() => vi.advanceTimersByTime(FEEDBACK_MS))
    expect(matchStore.getState().shootout.userScore).toBe(1)
    expect(screen.getByText(/you're in goal/i)).toBeDefined()
    expect(screen.getByText('Question 1?')).toBeDefined()
  })

  it('treats a wrong answer as a miss', async () => {
    await act(() => matchStore.start())
    render(<MatchScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Wrong 1' }))
    expect(screen.getByText(/miss!/i)).toBeDefined()
    act(() => vi.advanceTimersByTime(FEEDBACK_MS))
    const { shootout } = matchStore.getState()
    expect(shootout.userScore).toBe(0)
    expect(shootout.kicks[0].correct).toBe(false)
  })

  it('records a miss when the timer runs out', async () => {
    await act(() => matchStore.start())
    render(<MatchScreen />)
    // each 1s tick schedules the next from an effect, so flush tick by tick
    for (let i = 0; i < QUESTION_TIME_SECONDS; i++) act(() => vi.advanceTimersByTime(1000))
    act(() => vi.advanceTimersByTime(FEEDBACK_MS))
    const { shootout } = matchStore.getState()
    expect(shootout.kicks).toHaveLength(1)
    expect(shootout.kicks[0].correct).toBe(false)
  })

  it('swaps to the animation screen while feedback plays, then back to the question', async () => {
    await act(() => matchStore.start())
    render(<MatchScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Right' }))
    // animation screen: question and answers are gone
    expect(screen.queryByText('Question 0?')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText(/goal!/i)).toBeDefined()
    act(() => vi.advanceTimersByTime(FEEDBACK_MS))
    // back to the next question screen
    expect(screen.getByText('Question 1?')).toBeDefined()
    expect(screen.getAllByRole('button')).toHaveLength(4)
  })

  it('shows WIN, the final score and Play Again when the user wins', async () => {
    await act(() => matchStore.start())
    for (let i = 0; i < 10; i++) matchStore.submitAnswer(true) // 5-0 win
    render(<MatchScreen />)
    expect(screen.getByText(/you win/i)).toBeDefined()
    expect(screen.getByText('5 – 0')).toBeDefined()
    expect(screen.getByRole('button', { name: /play again/i })).toBeDefined()
  })

  it('shows LOSE when the CPU wins', async () => {
    await act(() => matchStore.start())
    for (let i = 0; i < 10; i++) matchStore.submitAnswer(false) // 0-5 loss
    render(<MatchScreen />)
    expect(screen.getByText(/you lose/i)).toBeDefined()
  })

  it('restarts a fresh match in place when Play Again is clicked', async () => {
    await act(() => matchStore.start())
    for (let i = 0; i < 10; i++) matchStore.submitAnswer(true)
    render(<MatchScreen />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /play again/i }))
    })
    expect(getQuestions).toHaveBeenCalledTimes(2)
    expect(matchStore.getState().shootout.kicks).toHaveLength(0)
    expect(screen.getByText('Question 0?')).toBeDefined()
  })

  it('goes to the main menu from the cpu result screen', async () => {
    await act(() => matchStore.start())
    for (let i = 0; i < 10; i++) matchStore.submitAnswer(true)
    const onMainMenu = vi.fn()
    render(<MatchScreen onMainMenu={onMainMenu} />)
    fireEvent.click(screen.getByRole('button', { name: /main menu/i }))
    expect(onMainMenu).toHaveBeenCalled()
    expect(matchStore.getState().phase).toBe('idle')
  })

  it('leaves the match and goes to the main menu from the 1v1 result screen', () => {
    let handleMessage: ((m: ServerMessage) => void) | undefined
    const close = vi.fn()
    const socket: MultiplayerSocket = {
      send: () => {},
      onMessage: (h) => {
        handleMessage = h
        return () => {}
      },
      onClose: () => () => {},
      close,
    }
    matchStore.start1v1({ socket, opponentName: 'Bob', youGoFirst: true, questions: sample })
    act(() => {
      for (let i = 0; i < 5; i++) {
        handleMessage?.({ type: 'kickResolved', by: 'you', scored: true })
        handleMessage?.({ type: 'kickResolved', by: 'opponent', scored: false })
      }
    })
    const onMainMenu = vi.fn()
    render(<MatchScreen onMainMenu={onMainMenu} />)
    fireEvent.click(screen.getByRole('button', { name: /main menu/i }))
    expect(close).toHaveBeenCalled()
    expect(onMainMenu).toHaveBeenCalled()
  })

  it('keeps the equipped GK skin during the opponent-kick feedback while defending in 1v1', () => {
    authStore.applyCustomizationUpdate('gkSkin', 'gk_manuel_neuer')
    let handleMessage: ((m: ServerMessage) => void) | undefined
    const socket: MultiplayerSocket = {
      send: () => {},
      onMessage: (h) => {
        handleMessage = h
        return () => {}
      },
      onClose: () => () => {},
      close: () => {},
    }
    matchStore.start1v1({ socket, opponentName: 'Bob', youGoFirst: false, questions: sample })
    render(<MatchScreen />)
    // opponent kicks while we defend: the store flips stage to 'shoot' at once,
    // but the animation depicts the 'keep' kick, so our keeper stays skinned
    act(() => handleMessage?.({ type: 'kickResolved', by: 'opponent', scored: false }))
    expect(screen.getByText(/saved!/i)).toBeDefined()
    expect(document.querySelector('.scene__keeper')?.className).toContain('scene__keeper--skinned')
    authStore.applyCustomizationUpdate('gkSkin', 'default')
  })

  it('lifts the dark overlay while spectating the opponent in 1v1', () => {
    const socket: MultiplayerSocket = {
      send: () => {},
      onMessage: () => () => {},
      onClose: () => () => {},
      close: () => {},
    }
    matchStore.start1v1({ socket, opponentName: 'Bob', youGoFirst: false, questions: sample })
    render(<MatchScreen />)
    expect(screen.getByText(/waiting for bob/i)).toBeDefined()
    expect(document.querySelector('main.match')?.className).toContain('match--scene')
  })

  it('shows the error state when questions fail to load', async () => {
    getQuestions.mockResolvedValue([])
    await act(() => matchStore.start())
    render(<MatchScreen />)
    expect(screen.getByText(/couldn't load/i)).toBeDefined()
  })
})
