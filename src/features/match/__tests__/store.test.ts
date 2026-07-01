import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Question } from '../../../types/trivia'

const sample: Question[] = Array.from({ length: 4 }, (_, i) => ({
  id: `q${i}`,
  prompt: `Q${i}?`,
  correctAnswer: 'A',
  answers: ['A', 'B', 'C', 'D'],
  difficulty: 'easy',
  category: 'Sports',
}))

const getQuestions = vi.fn<(count: number) => Promise<Question[]>>()
vi.mock('../../../services/trivia/questionSource', () => ({
  getQuestions: (count: number) => getQuestions(count),
}))

import { matchStore } from '../store'

beforeEach(() => {
  matchStore.reset()
  getQuestions.mockReset()
  getQuestions.mockResolvedValue(sample)
})

describe('matchStore', () => {
  it('starts idle with a fresh shootout', () => {
    const s = matchStore.getState()
    expect(s.phase).toBe('idle')
    expect(s.shootout.status).toBe('playing')
  })

  it('loads a question batch and becomes active', async () => {
    await matchStore.start()
    expect(matchStore.getState().phase).toBe('active')
    expect(matchStore.getCurrentQuestion()).toEqual(sample[0])
  })

  it('advances the question and resolves the kick on an answer', async () => {
    await matchStore.start()
    matchStore.submitAnswer(true) // user shoots and scores
    const s = matchStore.getState()
    expect(s.shootout.userScore).toBe(1)
    expect(s.questionIndex).toBe(1)
    expect(matchStore.getCurrentQuestion()).toEqual(sample[1])
  })

  it('notifies subscribers on state change', async () => {
    const spy = vi.fn()
    const unsub = matchStore.subscribe(spy)
    await matchStore.start()
    expect(spy).toHaveBeenCalled()
    unsub()
  })

  it('ignores answers once the match is over', async () => {
    await matchStore.start()
    for (let i = 0; i < 10; i++) matchStore.submitAnswer(true) // win 5-0
    expect(matchStore.getState().shootout.status).toBe('won')
    const before = matchStore.getState().shootout
    matchStore.submitAnswer(false)
    expect(matchStore.getState().shootout).toBe(before)
  })

  it('goes to error phase when no questions come back', async () => {
    getQuestions.mockResolvedValue([])
    await matchStore.start()
    expect(matchStore.getState().phase).toBe('error')
  })
})
