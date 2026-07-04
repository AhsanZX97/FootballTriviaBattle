import type { BankEntry, Difficulty } from '../../../types/trivia'

/** Terse authoring helper so each bank entry fits on one line. */
export function q(
  prompt: string,
  correctAnswer: string,
  wrongAnswers: [string, string, string],
  difficulty: Difficulty,
): BankEntry {
  return { prompt, correctAnswer, wrongAnswers, difficulty }
}
