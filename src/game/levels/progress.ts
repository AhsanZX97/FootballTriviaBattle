import type { LevelDef } from './manifest'

/** Solved question ids mapped to the wrong tries it took. */
export type SolvedMap = Readonly<Record<string, number>>

export function isSolved(solved: SolvedMap, questionId: string): boolean {
  return Object.prototype.hasOwnProperty.call(solved, questionId)
}

export function levelProgress(
  level: Pick<LevelDef, 'questionIds'>,
  solved: SolvedMap,
): { solved: number; total: number } {
  return {
    solved: level.questionIds.filter((id) => isSolved(solved, id)).length,
    total: level.questionIds.length,
  }
}

export function isComplete(level: Pick<LevelDef, 'questionIds'>, solved: SolvedMap): boolean {
  return level.questionIds.every((id) => isSolved(solved, id))
}
