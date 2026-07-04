import { describe, expect, it } from 'vitest'
import type { BankQuestion } from '../bank'
import { sampleQuestions } from '../sampler'

function makeBank(size: number): BankQuestion[] {
  return Array.from({ length: size }, (_, i) => ({
    id: `t-${i}`,
    prompt: `Question ${i}?`,
    correctAnswer: `Right ${i}`,
    wrongAnswers: [`Wrong ${i}a`, `Wrong ${i}b`, `Wrong ${i}c`],
    difficulty: 'easy' as const,
    category: 'Test',
  }))
}

/** Deterministic rng so shuffles are reproducible. */
function seededRng(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

describe('sampleQuestions', () => {
  it('returns the requested number of distinct questions', () => {
    const out = sampleQuestions(makeBank(50), 10, { rng: seededRng(1) })
    expect(out).toHaveLength(10)
    expect(new Set(out.map((question) => question.id)).size).toBe(10)
  })

  it('caps at the bank size when more questions are requested than exist', () => {
    const out = sampleQuestions(makeBank(5), 30, { rng: seededRng(1) })
    expect(out).toHaveLength(5)
  })

  it('avoids excluded ids when the remaining pool is large enough', () => {
    const excluded = new Set(['t-0', 't-1', 't-2'])
    const out = sampleQuestions(makeBank(20), 10, { rng: seededRng(2), excludeIds: excluded })
    expect(out.some((question) => excluded.has(question.id))).toBe(false)
  })

  it('dips into excluded ids rather than coming up short', () => {
    const excluded = new Set(Array.from({ length: 8 }, (_, i) => `t-${i}`))
    const out = sampleQuestions(makeBank(10), 6, { rng: seededRng(3), excludeIds: excluded })
    expect(out).toHaveLength(6)
    expect(new Set(out.map((question) => question.id)).size).toBe(6)
  })

  it('includes the correct answer and all wrong answers in every question', () => {
    const out = sampleQuestions(makeBank(10), 10, { rng: seededRng(4) })
    for (const question of out) {
      expect(question.answers).toHaveLength(4)
      expect(question.answers).toContain(question.correctAnswer)
    }
  })

  it('does not leave the correct answer in the same slot every time', () => {
    const out = sampleQuestions(makeBank(40), 40, { rng: seededRng(5) })
    const positions = new Set(out.map((question) => question.answers.indexOf(question.correctAnswer)))
    expect(positions.size).toBeGreaterThan(1)
  })
})
