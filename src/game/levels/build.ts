import type { Difficulty } from '../../types/trivia'
import { levelPrize } from './rewards'

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

/** `level_questions` and `level_prizes` rows for levels `from`..`to` that exist.
 * Used by `scripts/buildLevels.ts --sql`. */
export function levelSeedSql(levels: readonly (readonly string[])[], from: number, to: number): string {
  const rows: string[] = []
  const prizes: string[] = []
  const last = Math.min(to, levels.length)
  for (let n = from; n <= last; n++) {
    for (const id of levels[n - 1] ?? []) rows.push(`  ('${id}', ${n})`)
    const prize = levelPrize(n)
    prizes.push(prize.kind === 'item' ? `  (${n}, '${prize.itemId}', 0)` : `  (${n}, null, ${prize.coins})`)
  }
  return `insert into level_questions (question_id, level) values\n${rows.join(',\n')}\non conflict (question_id) do nothing;\n\ninsert into level_prizes (level, item_id, coins) values\n${prizes.join(',\n')}\non conflict (level) do nothing;`
}
