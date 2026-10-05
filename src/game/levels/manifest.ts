export interface LevelDef {
  level: number
  title: string
  /** Bank question ids (`wc-1`), in card order. */
  questionIds: string[]
}

/**
 * Append-only: reordering moves solved questions between levels and breaks
 * saved progress plus the `level_questions` seed in the migrations.
 */
export const LEVELS: LevelDef[] = [{ level: 1, title: 'SUNDAY LEAGUE', questionIds: ['wc-1'] }]

export function levelOf(level: number): LevelDef | undefined {
  return LEVELS.find((l) => l.level === level)
}
