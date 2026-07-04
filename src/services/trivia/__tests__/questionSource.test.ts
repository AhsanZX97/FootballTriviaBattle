import { beforeEach, describe, expect, it } from 'vitest'
import { getQuestions } from '../questionSource'
import { footballBank } from '../bank'

describe('getQuestions', () => {
  beforeEach(() => localStorage.clear())

  it('returns the requested number of questions from the football bank', async () => {
    const out = await getQuestions(10)
    expect(out).toHaveLength(10)
    const bankIds = new Set(footballBank.map((entry) => entry.id))
    for (const question of out) expect(bankIds.has(question.id)).toBe(true)
  })

  it('does not repeat questions from the previous match', async () => {
    const first = await getQuestions(30)
    const second = await getQuestions(30)
    const firstIds = new Set(first.map((question) => question.id))
    expect(second.some((question) => firstIds.has(question.id))).toBe(false)
  })

  it('keeps serving full batches match after match', async () => {
    for (let i = 0; i < 10; i++) {
      expect(await getQuestions(30)).toHaveLength(30)
    }
  })

  it('shuffles answers so the correct one is not always first', async () => {
    const out = await getQuestions(30)
    const positions = new Set(out.map((question) => question.answers.indexOf(question.correctAnswer)))
    expect(positions.size).toBeGreaterThan(1)
  })
})
