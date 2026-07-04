import type { BankEntry } from '../../../types/trivia'
import { worldCup } from './worldCup'
import { europeanCups } from './europeanCups'
import { leagues } from './leagues'
import { players } from './players'
import { clubs } from './clubs'
import { nationalTeams } from './nationalTeams'
import { rules } from './rules'
import { records } from './records'

export interface BankQuestion extends BankEntry {
  /** Stable across sessions — used to avoid repeating recently seen questions. */
  id: string
  /** Display category, e.g. "World Cup". */
  category: string
}

const topics: Array<[prefix: string, category: string, entries: BankEntry[]]> = [
  ['wc', 'World Cup', worldCup],
  ['ec', 'European Cups', europeanCups],
  ['lg', 'Leagues', leagues],
  ['pl', 'Players', players],
  ['cl', 'Clubs', clubs],
  ['nt', 'National Teams', nationalTeams],
  ['ru', 'Rules & Tactics', rules],
  ['re', 'Records & History', records],
]

/** The full football-only question bank, ids stable as long as entries keep their order. */
export const footballBank: BankQuestion[] = topics.flatMap(([prefix, category, entries]) =>
  entries.map((entry, i) => ({ ...entry, id: `${prefix}-${i}`, category })),
)
