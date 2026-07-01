export type Difficulty = 'easy' | 'medium' | 'hard'

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
