import type { Question } from '../../types/trivia'
import { localisedBank } from './bank/localised'
import { sampleQuestions } from './sampler'
import { loadRecentIds, recordRecentIds } from './recentIds'
import { i18nStore } from '../i18n/store'

/**
 * The single seam the rest of the app talks to. Serves the bundled
 * football-only bank in the player's language — no network, no rate limits,
 * works offline. Recently seen questions are avoided across matches
 * (best-effort, via localStorage); ids are locale-independent, so switching
 * language doesn't resurface questions that were just answered.
 * Kept async so callers don't care where questions come from.
 */
export async function getQuestions(count: number): Promise<Question[]> {
  const bank = localisedBank(i18nStore.getLocale())
  const questions = sampleQuestions(bank, count, { excludeIds: loadRecentIds() })
  recordRecentIds(questions.map((question) => question.id))
  return questions
}
