import { LEVEL_IDS } from './levelIds'
import { levelPrize, type LevelPrize } from './rewards'

export interface LevelDef {
  level: number
  title: string
  /** Bank question ids (`wc-1`), in card order. */
  questionIds: string[]
  prize: LevelPrize
}

/** Career ladder, one per frozen level. The last rung is the Ballon d'Or.
 * A new level appended to `levelIds.ts` needs a title here and a migration
 * seeding its questions and prize, or the server refuses its claims. */
const TITLES = [
  'SUNDAY LEAGUE',
  'ACADEMY',
  'RESERVES',
  'FIRST TEAM',
  'CAPTAIN',
  'LOCAL DERBY',
  'CUP RUN',
  'PROMOTION',
  'TOP FLIGHT',
  'CONTINENTAL',
  'GROUP STAGE',
  'KNOCKOUT',
  'SEMI-FINAL',
  'THE FINAL',
  'TROPHY LIFT',
  'CHAMPIONS',
  'THE TREBLE',
  'INTERNATIONAL',
  'WORLD CUP',
  'GOLDEN BOOT',
  'CLUB LEGEND',
  'HALL OF FAME',
  'ALL-TIME XI',
  'ICON',
  'THE GREATEST',
  'IMMORTAL',
  'RECORD BOOKS',
  "BALLON D'OR",
]

/**
 * The question ids come from the frozen deal in `levelIds.ts`, which is
 * append-only: reordering moves solved questions between levels and breaks
 * saved progress plus the `level_questions` seed in the migrations.
 * Every level here is seeded by 0019–0021.
 */
export const LEVELS: LevelDef[] = LEVEL_IDS.map((questionIds, i) => ({
  level: i + 1,
  title: TITLES[i] ?? `LEVEL ${i + 1}`,
  questionIds,
  prize: levelPrize(i + 1),
}))

export function levelOf(level: number): LevelDef | undefined {
  return LEVELS.find((l) => l.level === level)
}
