import type { Question } from '../../types/trivia'
import { footballBank } from './bank'
import { sampleQuestions } from './sampler'
import { loadRecentIds, recordRecentIds } from './recentIds'

/**
 * The single seam the rest of the app talks to. Serves the bundled
 * football-only bank — no network, no rate limits, works offline. Recently
 * seen questions are avoided across matches (best-effort, via localStorage).
 * Kept async so callers don't care where questions come from.
 */
export async function getQuestions(count: number): Promise<Question[]> {
  const questions = sampleQuestions(footballBank, count, { excludeIds: loadRecentIds() })
  recordRecentIds(questions.map((question) => question.id))
  return questions
}
