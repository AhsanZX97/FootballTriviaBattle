import type { TranslatedEntry } from '../../../../types/trivia'

/**
 * Terse authoring helper so each translated entry fits on one line, mirroring
 * `bank/entry.ts`'s `q`. No difficulty argument — that lives on the English
 * entry and is language-independent.
 */
export function tq(
  prompt: string,
  correctAnswer: string,
  wrongAnswers: [string, string, string],
): TranslatedEntry {
  return { prompt, correctAnswer, wrongAnswers }
}
