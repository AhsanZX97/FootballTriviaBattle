import { describe, expect, it } from 'vitest'
import { buildLevelIds, levelSeedSql } from '../build'
import { footballBank } from '../../../services/trivia/bank'
import type { Difficulty } from '../../../types/trivia'

const RANK: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2 }
const byId = new Map(footballBank.map((q) => [q.id, q]))
const topic = (id: string) => id.split('-')[0]
const meanRank = (ids: string[]) => ids.reduce((sum, id) => sum + RANK[byId.get(id)!.difficulty], 0) / ids.length

describe('buildLevelIds', () => {
  const levels = buildLevelIds(footballBank, 24)

  it('uses every bank question exactly once', () => {
    const all = levels.flat()
    expect(all).toHaveLength(footballBank.length)
    expect(new Set(all).size).toBe(footballBank.length)
  })

  it('fills levels of 24, with only the last one short', () => {
    expect(levels.slice(0, -1).every((l) => l.length === 24)).toBe(true)
    expect(levels.at(-1)!.length).toBe(footballBank.length % 24 || 24)
  })

  it('is deterministic', () => {
    expect(buildLevelIds(footballBank, 24)).toEqual(levels)
  })

  it('keeps wc-1 in Level 1, where the Phase 1 seed put it', () => {
    expect(levels[0]).toContain('wc-1')
  })

  it('mixes categories inside every full level', () => {
    for (const level of levels.slice(0, -1)) {
      expect(new Set(level.map(topic)).size).toBeGreaterThanOrEqual(6)
    }
  })

  it('never lets one category take over a level', () => {
    for (const level of levels.slice(0, -1)) {
      const counts = new Map<string, number>()
      for (const id of level) counts.set(topic(id), (counts.get(topic(id)) ?? 0) + 1)
      expect(Math.max(...counts.values())).toBeLessThanOrEqual(8)
    }
  })

  it('gets harder from the first levels to the last', () => {
    const early = levels.slice(0, 3).flat()
    const late = levels.slice(-4, -1).flat()
    expect(meanRank(early)).toBeLessThan(0.6)
    expect(meanRank(late)).toBeGreaterThan(1.4)
  })

  it('starts each topic on its easiest questions', () => {
    const first = levels[0].filter((id) => topic(id) === 'wc')
    expect(first.every((id) => byId.get(id)!.difficulty === 'easy')).toBe(true)
  })
})

describe('levelSeedSql', () => {
  it('seeds only the requested levels that exist, questions and prizes', () => {
    const sql = levelSeedSql([['wc-1'], ['pt-4', 'pl-3']], 2, 9)
    expect(sql).toContain("('pt-4', 2)")
    expect(sql).toContain("('pl-3', 2)")
    expect(sql).not.toContain('wc-1')
    expect(sql).toContain('(2, null, 50)')
    expect(sql).not.toContain('(3,')
    expect(sql).toContain('on conflict (question_id) do nothing')
    expect(sql).toContain('on conflict (level) do nothing')
  })
})
