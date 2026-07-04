import { beforeEach, describe, expect, it } from 'vitest'
import { MAX_RECENT_IDS, loadRecentIds, recordRecentIds } from '../recentIds'

describe('recentIds', () => {
  beforeEach(() => localStorage.clear())

  it('returns an empty set when nothing has been stored', () => {
    expect(loadRecentIds().size).toBe(0)
  })

  it('loads back what was recorded', () => {
    recordRecentIds(['a', 'b', 'c'])
    expect([...loadRecentIds()]).toEqual(['a', 'b', 'c'])
  })

  it('appends across calls without duplicating ids', () => {
    recordRecentIds(['a', 'b'])
    recordRecentIds(['b', 'c'])
    expect([...loadRecentIds()]).toEqual(['a', 'b', 'c'])
  })

  it('keeps only the most recent ids once the cap is hit', () => {
    const first = Array.from({ length: MAX_RECENT_IDS }, (_, i) => `old-${i}`)
    recordRecentIds(first)
    recordRecentIds(['new-1', 'new-2'])
    const stored = loadRecentIds()
    expect(stored.size).toBe(MAX_RECENT_IDS)
    expect(stored.has('new-1')).toBe(true)
    expect(stored.has('new-2')).toBe(true)
    expect(stored.has('old-0')).toBe(false)
  })

  it('returns an empty set when the stored value is corrupt', () => {
    localStorage.setItem('ftb.recentQuestionIds', 'not json')
    expect(loadRecentIds().size).toBe(0)
  })
})
