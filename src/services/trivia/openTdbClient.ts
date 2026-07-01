import type { Difficulty, Question } from '../../types/trivia'

const ENDPOINT = 'https://opentdb.com/api.php'
const SPORTS_CATEGORY = 21

/** Shape of a single OpenTDB result row (type=multiple). */
export interface OpenTdbRow {
  category: string
  type: string
  difficulty: Difficulty
  question: string
  correct_answer: string
  incorrect_answers: string[]
}

interface OpenTdbResponse {
  response_code: number
  results: OpenTdbRow[]
}

/** Decode HTML entities (named + numeric) the way a browser would. */
export function decodeEntities(text: string): string {
  return new DOMParser().parseFromString(text, 'text/html').documentElement.textContent ?? text
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Map one decoded OpenTDB row into our Question shape. rng injectable for tests. */
export function mapRowToQuestion(row: OpenTdbRow, id: string, rng: () => number = Math.random): Question {
  const correctAnswer = decodeEntities(row.correct_answer)
  const answers = shuffle(
    [correctAnswer, ...row.incorrect_answers.map(decodeEntities)],
    rng,
  )
  return {
    id,
    prompt: decodeEntities(row.question),
    correctAnswer,
    answers,
    difficulty: row.difficulty,
    category: decodeEntities(row.category),
  }
}

export function buildUrl(amount: number): string {
  return `${ENDPOINT}?amount=${amount}&category=${SPORTS_CATEGORY}&type=multiple`
}

/**
 * Fetch a batch of Sports questions. Throws on any failure (network, non-200,
 * OpenTDB error code, empty result) — questionSource turns that into a fallback.
 */
export async function fetchQuestions(amount: number): Promise<Question[]> {
  const res = await fetch(buildUrl(amount))
  if (!res.ok) throw new Error(`OpenTDB HTTP ${res.status}`)
  const data = (await res.json()) as OpenTdbResponse
  if (data.response_code !== 0 || data.results.length === 0) {
    throw new Error(`OpenTDB response_code ${data.response_code}, ${data.results.length} results`)
  }
  return data.results.map((row, i) => mapRowToQuestion(row, `q${i}`))
}
