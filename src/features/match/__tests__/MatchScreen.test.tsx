import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import type { Question } from '../../../types/trivia'

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

import { matchStore } from '../store'
import { MatchScreen } from '../MatchScreen'

beforeEach(() => {
  matchStore.reset()
  getQuestions.mockReset()
  getQuestions.mockResolvedValue(sample)
})

describe('MatchScreen', () => {
  it('shows the question, answers, scores and stage label when active', async () => {
    await act(() => matchStore.start())
    render(<MatchScreen />)
    expect(screen.getByText('Question 0?')).toBeDefined()
    expect(screen.getAllByRole('button')).toHaveLength(4)
    expect(screen.getByText(/you're shooting/i)).toBeDefined()
  })

  it('scores a goal on a correct answer and flips the stage', async () => {
    await act(() => matchStore.start())
    render(<MatchScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Right' }))
    expect(matchStore.getState().shootout.userScore).toBe(1)
    expect(screen.getByText(/you're in goal/i)).toBeDefined()
    expect(screen.getByText('Question 1?')).toBeDefined()
  })

  it('treats a wrong answer as a miss', async () => {
    await act(() => matchStore.start())
    render(<MatchScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Wrong 1' }))
    expect(matchStore.getState().shootout.userScore).toBe(0)
  })

  it('shows the error state when questions fail to load', async () => {
    getQuestions.mockResolvedValue([])
    await act(() => matchStore.start())
    render(<MatchScreen />)
    expect(screen.getByText(/couldn't load/i)).toBeDefined()
  })
})
