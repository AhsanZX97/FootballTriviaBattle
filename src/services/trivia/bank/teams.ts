import type { BankEntry, Difficulty } from '../../../types/trivia'
import teams from '../../../assets/teams/teams.json'

/**
 * "Which club is this?" questions, built from the crest pack manifest
 * (`src/assets/teams/teams.json`, produced by `scripts/teams/`). `image` is
 * `teams/<file stem>`, resolved by `features/match/playerPortrait.ts`; it is a
 * key rather than a URL because the Node server loads this bank too.
 *
 * Ids are `pt-<index>` over manifest order, so the pipeline only ever appends.
 */
interface Team {
  id: string
  name: string
  country: string | null
  sitelinks?: number
}

const PACK: Team[] = teams

const POOL_SIZE = 8

// Same country reads as a plausible wrong answer; closeness in fame keeps a
// giant from being paired with obvious minnows.
function closeness(a: Team, b: Team) {
  let score = 0
  if (a.country && a.country === b.country) score += 1000
  score -= Math.abs((a.sitelinks ?? 0) - (b.sitelinks ?? 0))
  return score
}

function decoys(index: number): [string, string, string] {
  const self = PACK[index]
  const pool = PACK.map((t, i) => ({ t, i }))
    .filter(({ i }) => i !== index)
    .sort((x, y) => closeness(self, y.t) - closeness(self, x.t) || x.i - y.i)
    .slice(0, POOL_SIZE)
  // 3 is coprime with POOL_SIZE, so the three picks are always distinct.
  return [0, 1, 2].map((k) => pool[(index + k * 3) % pool.length].t.name) as [string, string, string]
}

function difficultyByFame(): Difficulty[] {
  const ranked = PACK.map((t, i) => ({ i, links: t.sitelinks ?? 0 })).sort((a, b) => b.links - a.links)
  const out: Difficulty[] = new Array(PACK.length)
  ranked.forEach(({ i }, rank) => {
    const share = rank / ranked.length
    out[i] = share < 0.3 ? 'easy' : share < 0.7 ? 'medium' : 'hard'
  })
  return out
}

const DIFFICULTY = difficultyByFame()

export const teamPictures: BankEntry[] = PACK.map((team, i) => ({
  prompt: 'Which club has this badge?',
  correctAnswer: team.name,
  wrongAnswers: decoys(i),
  difficulty: DIFFICULTY[i],
  image: `teams/${team.id}`,
}))
