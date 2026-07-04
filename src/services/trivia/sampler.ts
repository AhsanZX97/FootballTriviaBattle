import type { Question } from '../../types/trivia'
import type { BankQuestion } from './bank'

export interface SampleOptions {
  /** Injectable for deterministic tests. */
  rng?: () => number
  /** Ids to avoid (recently seen). Ignored where the pool would run short. */
  excludeIds?: ReadonlySet<string>
}

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function toQuestion(entry: BankQuestion, rng: () => number): Question {
  return {
    id: entry.id,
    prompt: entry.prompt,
    correctAnswer: entry.correctAnswer,
    answers: shuffle([entry.correctAnswer, ...entry.wrongAnswers], rng),
    difficulty: entry.difficulty,
    category: entry.category,
  }
}

/**
 * Draw `count` distinct questions from the bank, preferring ones not in
 * `excludeIds` but dipping back into them rather than returning fewer than
 * requested. Answers are shuffled per draw so the correct one never sits in
 * a fixed slot.
 */
export function sampleQuestions(
  bank: readonly BankQuestion[],
  count: number,
  { rng = Math.random, excludeIds }: SampleOptions = {},
): Question[] {
  const fresh = excludeIds ? bank.filter((entry) => !excludeIds.has(entry.id)) : bank.slice()
  const seen = excludeIds ? bank.filter((entry) => excludeIds.has(entry.id)) : []
  const pool = [...shuffle(fresh, rng), ...shuffle(seen, rng)]
  return pool.slice(0, count).map((entry) => toQuestion(entry, rng))
}
