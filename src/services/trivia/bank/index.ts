import type { BankEntry } from '../../../types/trivia'
import { worldCup } from './worldCup'
import { europeanCups } from './europeanCups'
import { leagues } from './leagues'
import { players } from './players'
import { clubs } from './clubs'
import { nationalTeams } from './nationalTeams'
import { rules } from './rules'
import { records } from './records'
import { pictures } from './pictures'

export interface BankQuestion extends BankEntry {
  /** Stable across sessions — used to avoid repeating recently seen questions. */
  id: string
  /** Display category, e.g. "World Cup". */
  category: string
}

/** Topic id — also the prefix of every question id drawn from that topic. */
export type TopicPrefix = 'wc' | 'ec' | 'lg' | 'pl' | 'cl' | 'nt' | 'ru' | 're' | 'pp'

/**
 * The source (English) bank, by topic. `category` is internal bookkeeping, not
 * UI text — nothing renders it — so it is deliberately not translated.
 *
 * Exported because the per-locale banks walk this same list in this same order:
 * question ids are `${prefix}-${index}`, so order is load-bearing.
 */
export const TOPICS: Array<[prefix: TopicPrefix, category: string, entries: BankEntry[]]> = [
  ['wc', 'World Cup', worldCup],
  ['ec', 'European Cups', europeanCups],
  ['lg', 'Leagues', leagues],
  ['pl', 'Players', players],
  ['cl', 'Clubs', clubs],
  ['nt', 'National Teams', nationalTeams],
  ['ru', 'Rules & Tactics', rules],
  ['re', 'Records & History', records],
  ['pp', 'Picture Players', pictures],
]

/**
 * What a shared match may draw from. Picture questions need every player's
 * build to know the `pp-` ids and own the portraits, so they are only offered
 * when all of them said so.
 */
export function bankForMatch(bank: BankQuestion[], everyoneSupportsPictures: boolean): BankQuestion[] {
  return everyoneSupportsPictures ? bank : bank.filter((entry) => !entry.image)
}

/** The full football-only question bank, ids stable as long as entries keep their order. */
export const footballBank: BankQuestion[] = TOPICS.flatMap(([prefix, category, entries]) =>
  entries.map((entry, i) => ({ ...entry, id: `${prefix}-${i}`, category })),
)
