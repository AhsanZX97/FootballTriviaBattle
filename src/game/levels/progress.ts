import type { LevelDef } from './manifest'
import { unlockAt } from './rewards'

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

/** Questions solved across every level. The count only ever grows. */
export function totalSolved(solved: SolvedMap): number {
  return Object.keys(solved).length
}

/** Level 1 is open immediately; later levels open on the total solved count. */
export function isUnlocked(level: number, solved: SolvedMap): boolean {
  return totalSolved(solved) >= unlockAt(level)
}

/** The next unsolved card after this one, in the level's list order. */
export function nextLevelQuestion(
  questionId: string,
  solved: SolvedMap,
  levels: readonly Pick<LevelDef, 'questionIds'>[],
): string | undefined {
  const level = levels.find((l) => l.questionIds.includes(questionId))
  if (!level) return undefined
  const after = level.questionIds.indexOf(questionId) + 1
  return level.questionIds.slice(after).find((id) => !isSolved(solved, id))
}
