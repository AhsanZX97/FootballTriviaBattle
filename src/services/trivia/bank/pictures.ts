import type { BankEntry, Difficulty } from '../../../types/trivia'
import players from '../../../assets/players/players.json'

/**
 * "Who is this player?" questions, built from the portrait pack manifest
 * (`src/assets/players/players.json`, produced by `scripts/players/`). `image`
 * is the portrait's file stem, not a URL: this bank is also loaded by the Node
 * server, which cannot import `.webp`. The client resolves the key through
 * `features/match/playerPortrait.ts`.
 *
 * Ids are `pp-<index>` over manifest order, so the pipeline only ever appends
 * to `players.json`; reordering would break recent-question history.
 */
interface Player {
  id: string
  name: string
  country: string | null
  born?: number | null
  sitelinks?: number
}

const PACK: Player[] = players

const POOL_SIZE = 8

// Same country and a similar birth year read as plausible wrong answers; the
// final three are spread across the best-scoring pool so one player is not
// always paired with the same decoys.
function closeness(a: Player, b: Player) {
  let score = 0
  if (a.country && a.country === b.country) score += 3
  if (a.born && b.born) {
    const gap = Math.abs(a.born - b.born)
    score += gap <= 8 ? 2 : gap <= 16 ? 1 : 0
  }
  return score
}

function decoys(index: number): [string, string, string] {
  const self = PACK[index]
  const pool = PACK.map((p, i) => ({ p, i }))
    .filter(({ i }) => i !== index)
    .sort((x, y) => closeness(self, y.p) - closeness(self, x.p) || x.i - y.i)
    .slice(0, POOL_SIZE)
  // 3 is coprime with POOL_SIZE, so the three picks are always distinct.
  return [0, 1, 2].map((k) => pool[(index + k * 3) % pool.length].p.name) as [string, string, string]
}

function difficultyByFame(): Difficulty[] {
  const ranked = PACK.map((p, i) => ({ i, links: p.sitelinks ?? 0 })).sort((a, b) => b.links - a.links)
  const out: Difficulty[] = new Array(PACK.length)
  ranked.forEach(({ i }, rank) => {
    const share = rank / ranked.length
    out[i] = share < 0.3 ? 'easy' : share < 0.7 ? 'medium' : 'hard'
  })
  return out
}

const DIFFICULTY = difficultyByFame()

export const pictures: BankEntry[] = PACK.map((player, i) => ({
  prompt: 'Who is this player?',
  correctAnswer: player.name,
  wrongAnswers: decoys(i),
  difficulty: DIFFICULTY[i],
  image: player.id,
}))
