import { LEVEL_IDS } from './levelIds'
import { levelPrize, unlockAt, type LevelPrize } from './rewards'

export interface LevelDef {
  level: number
  title: string
  /** Bank question ids (`wc-1`), in card order. */
  questionIds: string[]
  prize: LevelPrize
}

/** Career ladder, one per level. */
const TITLES = ['SUNDAY LEAGUE', 'ACADEMY']

/** Levels whose questions and prizes the server has seeded. Raising this needs
 * a migration seeding the new levels first, or their claims are refused. */
const PLAYABLE_LEVELS = 1

/**
 * The question ids come from the frozen deal in `levelIds.ts`, which is
 * append-only: reordering moves solved questions between levels and breaks
 * saved progress plus the `level_questions` seed in the migrations.
 */
export const LEVELS: LevelDef[] = LEVEL_IDS.slice(0, PLAYABLE_LEVELS).map((questionIds, i) => ({
  level: i + 1,
  title: TITLES[i],
  questionIds,
  prize: levelPrize(i + 1),
}))

/** The first level not playable yet, shown on home as a locked row. */
export const NEXT_LEVEL = {
  level: PLAYABLE_LEVELS + 1,
  title: TITLES[PLAYABLE_LEVELS],
  unlockAt: unlockAt(PLAYABLE_LEVELS + 1),
}

export function levelOf(level: number): LevelDef | undefined {
  return LEVELS.find((l) => l.level === level)
}
