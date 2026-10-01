import type { BankEntry } from '../../../types/trivia'

/**
 * "Who is this player?" questions. `image` is the portrait's file stem in
 * `src/assets/players/` (see `scripts/players/`), not a URL: this bank is also
 * loaded by the Node server, which cannot import `.webp`. The client resolves
 * the key through `features/match/playerPortrait.ts`.
 */
const PLAYERS = [
  ['lionel-messi', 'Lionel Messi'],
  ['cristiano-ronaldo', 'Cristiano Ronaldo'],
  ['pele', 'Pelé'],
  ['diego-maradona', 'Diego Maradona'],
  ['neymar', 'Neymar'],
  ['zinedine-zidane', 'Zinedine Zidane'],
  ['david-beckham', 'David Beckham'],
  ['kylian-mbappe', 'Kylian Mbappé'],
  ['johan-cruyff', 'Johan Cruyff'],
  ['francesco-totti', 'Francesco Totti'],
] as const

// Distractors are other players in the pack, picked by a fixed stride so every
// entry gets three distinct wrong names without needing a hand-written list.
const DISTRACTOR_STRIDES = [1, 3, 7] as const

export const pictures: BankEntry[] = PLAYERS.map(([image, name], i) => ({
  prompt: 'Who is this player?',
  correctAnswer: name,
  wrongAnswers: DISTRACTOR_STRIDES.map((s) => PLAYERS[(i + s) % PLAYERS.length][1]) as [
    string,
    string,
    string,
  ],
  difficulty: 'easy',
  image,
}))
