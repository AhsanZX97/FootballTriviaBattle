import type { Difficulty } from '../../types/trivia'

const RANK: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2 }

interface Dealable {
  id: string
  difficulty: Difficulty
}

/**
 * Deal the bank into levels of `perLevel` question ids.
 *
 * Each topic is sorted easy -> hard (bank order breaking ties), and every
 * question is placed by its relative position inside its own topic. That
 * spreads each topic evenly across the whole run, so a level's category mix is
 * proportional to the bank, and difficulty climbs because every topic climbs.
 * A plain round-robin would run the small topics dry early and leave the late
 * levels made almost entirely of picture questions.
 *
 * Only for `scripts/buildLevels.ts`: the app reads the frozen output in
 * `levelIds.ts`, because re-dealing a grown bank would move solved questions
 * between levels.
 */
export function buildLevelIds(bank: readonly Dealable[], perLevel: number): string[][] {
  const topics = new Map<string, Dealable[]>()
  for (const q of bank) {
    const prefix = q.id.split('-')[0]
    const list = topics.get(prefix) ?? []
    list.push(q)
    topics.set(prefix, list)
  }

  const topicOrder = [...topics.keys()]
  const placed: Array<{ id: string; at: number; topic: number }> = []
  topicOrder.forEach((prefix, topicIndex) => {
    const sorted = topics
      .get(prefix)!
      .map((q, i) => ({ q, i }))
      .sort((a, b) => RANK[a.q.difficulty] - RANK[b.q.difficulty] || a.i - b.i)
    sorted.forEach(({ q }, i) => placed.push({ id: q.id, at: (i + 0.5) / sorted.length, topic: topicIndex }))
  })
  placed.sort((a, b) => a.at - b.at || a.topic - b.topic)

  const levels: string[][] = []
  for (let i = 0; i < placed.length; i += perLevel) {
    levels.push(placed.slice(i, i + perLevel).map((p) => p.id))
  }
  return levels
}
