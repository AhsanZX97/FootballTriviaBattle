export type Difficulty = 'easy' | 'medium' | 'hard'

/**
 * Raw entry as authored in the football question bank. Answers are stored
 * unshuffled (correct + 3 wrong) — the sampler shuffles them into a Question
 * at draw time so the correct answer never sits in a predictable slot.
 */
export interface BankEntry {
  prompt: string
  correctAnswer: string
  wrongAnswers: [string, string, string]
  difficulty: Difficulty
}

export interface Question {
  /** Stable id within a batch (index-based is fine for Phase 1). */
  id: string
  prompt: string
  correctAnswer: string
  /** All options including the correct one, already shuffled for display. */
  answers: string[]
  difficulty: Difficulty
  category: string
}
