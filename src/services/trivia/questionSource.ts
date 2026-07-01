import type { Question } from '../../types/trivia'
import { fetchQuestions } from './openTdbClient'
import { bundledQuestions } from './bundledQuestions'

/**
 * The single seam the rest of the app talks to. OpenTDB now; a football-only
 * bank can replace this later without touching callers. Never throws — any
 * fetch failure falls back to the bundled set so the game can't hard-fail.
 */
export async function getQuestions(count: number): Promise<Question[]> {
  try {
    return await fetchQuestions(count)
  } catch {
    return bundledQuestions.slice(0, count)
  }
}
