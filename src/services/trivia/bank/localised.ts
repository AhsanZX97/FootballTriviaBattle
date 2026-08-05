import type { Locale } from '../../../types/i18n'
import type { Question } from '../../../types/trivia'
import { TOPICS, type BankQuestion } from './index'
import { TRANSLATIONS } from './translations'

/**
 * A question as it travels between two players: an id plus the order its four
 * answers are shown in. Deliberately carries no text — each client renders the
 * question from its own locale's bank, so a Spanish player and a German player
 * in the same match see the same question in their own language, with the
 * correct answer in the same on-screen slot.
 *
 * `answerOrder` indexes into the canonical `[correctAnswer, ...wrongAnswers]`,
 * so `[2, 0, 3, 1]` puts wrongAnswers[1] first and the correct answer second.
 */
export interface QuestionRef {
  id: string
  answerOrder: number[]
}

const CANONICAL_ANSWER_COUNT = 4

/** Built once per locale on first use — the bank is static for the session. */
const cache = new Map<Locale, BankQuestion[]>()

/**
 * The question bank in `locale`. Ids, difficulty, category and entry order all
 * come from the English bank; only the text is swapped. Any entry a locale
 * hasn't translated keeps its English text rather than going blank.
 */
export function localisedBank(locale: Locale): BankQuestion[] {
  const cached = cache.get(locale)
  if (cached) return cached

  const translations = TRANSLATIONS[locale]
  const bank: BankQuestion[] = TOPICS.flatMap(([prefix, category, entries]) =>
    entries.map((entry, i) => {
      const translated = translations?.[prefix]?.[i]
      return {
        ...entry,
        ...(translated ?? {}),
        id: `${prefix}-${i}`,
        category,
      }
    }),
  )

  cache.set(locale, bank)
  return bank
}

/** Id → entry, for resolving the ids that arrive over the wire. */
const indexes = new Map<Locale, Map<string, BankQuestion>>()

function bankIndex(locale: Locale): Map<string, BankQuestion> {
  const cached = indexes.get(locale)
  if (cached) return cached
  const index = new Map(localisedBank(locale).map((entry) => [entry.id, entry]))
  indexes.set(locale, index)
  return index
}

function isValidOrder(order: number[]): boolean {
  if (order.length !== CANONICAL_ANSWER_COUNT) return false
  const seen = new Set(order)
  if (seen.size !== CANONICAL_ANSWER_COUNT) return false
  return order.every((i) => Number.isInteger(i) && i >= 0 && i < CANONICAL_ANSWER_COUNT)
}

/**
 * Rebuild a playable Question from a wire ref, in the given locale. Returns
 * null for an id this build's bank doesn't have, or an answer order that isn't
 * a permutation of 0-3 — a client on an older bank should drop the question
 * rather than render a broken one.
 */
export function questionFromRef(ref: QuestionRef, locale: Locale): Question | null {
  const entry = bankIndex(locale).get(ref.id)
  if (!entry || !isValidOrder(ref.answerOrder)) return null
  const canonical = [entry.correctAnswer, ...entry.wrongAnswers]
  return {
    id: entry.id,
    prompt: entry.prompt,
    correctAnswer: entry.correctAnswer,
    answers: ref.answerOrder.map((i) => canonical[i]),
    difficulty: entry.difficulty,
    category: entry.category,
  }
}

/** Resolve a batch, dropping any ref this build can't render. */
export function questionsFromRefs(refs: QuestionRef[], locale: Locale): Question[] {
  return refs
    .map((ref) => questionFromRef(ref, locale))
    .filter((question): question is Question => question !== null)
}

/**
 * Questions for a `matched` / `rematchStart` payload. Prefers the locale-free
 * refs so the player reads the match in their own language, and falls back to
 * the server's English text if refs are absent (an older server) or resolve to
 * nothing (ids this build's bank doesn't have). Shared by the lobby, match and
 * presence stores so the three can't drift apart.
 */
export function questionsFromMatchPayload(
  payload: { questions: Question[]; questionRefs?: QuestionRef[] },
  locale: Locale,
): Question[] {
  if (!payload.questionRefs?.length) return payload.questions
  const resolved = questionsFromRefs(payload.questionRefs, locale)
  return resolved.length > 0 ? resolved : payload.questions
}

/**
 * The wire form of a locally-sampled question: its id plus where each of its
 * displayed answers sits in the canonical order. The inverse of
 * `questionFromRef`, used by the server to describe the sample it drew.
 */
export function refFromQuestion(question: Question, entry: BankQuestion): QuestionRef {
  const canonical = [entry.correctAnswer, ...entry.wrongAnswers]
  return {
    id: question.id,
    answerOrder: question.answers.map((answer) => canonical.indexOf(answer)),
  }
}

/**
 * Wire refs for a batch sampled from the English bank — what the server sends
 * so each client can render the same questions in its own language. Questions
 * not from the bundled bank are skipped rather than described incorrectly.
 */
export function refsForQuestions(questions: Question[]): QuestionRef[] {
  const index = bankIndex('en')
  return questions.flatMap((question) => {
    const entry = index.get(question.id)
    return entry ? [refFromQuestion(question, entry)] : []
  })
}
