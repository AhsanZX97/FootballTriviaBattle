import { afterEach, describe, expect, it, vi } from 'vitest'
import { getQuestions } from '../questionSource'
import { bundledQuestions } from '../bundledQuestions'

describe('getQuestions', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('falls back to the bundled set when the fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const out = await getQuestions(3)
    expect(out).toEqual(bundledQuestions.slice(0, 3))
  })

  it('falls back when OpenTDB returns an error code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response_code: 5, results: [] }),
    }))
    const out = await getQuestions(2)
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual(bundledQuestions[0])
  })

  it('returns mapped questions on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response_code: 0,
        results: [{
          category: 'Sports',
          type: 'multiple',
          difficulty: 'easy',
          question: 'Q?',
          correct_answer: 'A',
          incorrect_answers: ['B', 'C', 'D'],
        }],
      }),
    }))
    const out = await getQuestions(1)
    expect(out).toHaveLength(1)
    expect(out[0].correctAnswer).toBe('A')
  })
})
