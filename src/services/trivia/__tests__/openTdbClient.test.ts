import { afterEach, describe, expect, it, vi } from 'vitest'
import { decodeEntities, fetchQuestions, mapRowToQuestion, type OpenTdbRow } from '../openTdbClient'

const row: OpenTdbRow = {
  category: 'Sports &amp; Leisure',
  type: 'multiple',
  difficulty: 'medium',
  question: 'Who scored the &quot;Hand of God&#039;s&quot; goal?',
  correct_answer: 'Diego Maradona',
  incorrect_answers: ['Pel&eacute;', 'Z. Zidane', 'R. Ba&ggr;io'],
}

describe('decodeEntities', () => {
  it('decodes named and numeric HTML entities', () => {
    expect(decodeEntities('&quot;a&#039;s &amp; b&eacute;')).toBe('"a\'s & bé')
  })
})

describe('mapRowToQuestion', () => {
  it('decodes entities and includes the correct answer among four options', () => {
    const q = mapRowToQuestion(row, 'q0', () => 0)
    expect(q.prompt).toBe('Who scored the "Hand of God\'s" goal?')
    expect(q.correctAnswer).toBe('Diego Maradona')
    expect(q.category).toBe('Sports & Leisure')
    expect(q.answers).toHaveLength(4)
    expect(q.answers).toContain('Diego Maradona')
    expect(q.answers).toContain('Pelé')
    expect(q.difficulty).toBe('medium')
  })
})

describe('fetchQuestions', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('maps results when response_code is 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response_code: 0, results: [row] }),
    }))
    const out = await fetchQuestions(1)
    expect(out).toHaveLength(1)
    expect(out[0].correctAnswer).toBe('Diego Maradona')
  })

  it('throws when OpenTDB returns a non-zero response_code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response_code: 1, results: [] }),
    }))
    await expect(fetchQuestions(5)).rejects.toThrow()
  })

  it('throws on a non-200 HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }))
    await expect(fetchQuestions(5)).rejects.toThrow()
  })
})
