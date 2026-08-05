import { describe, expect, it } from 'vitest'
import { LOCALES } from '../../../../types/i18n'
import { footballBank, TOPICS } from '../index'
import { localisedBank, questionFromRef, questionsFromRefs, refFromQuestion } from '../localised'
import { TRANSLATIONS } from '../translations'

describe('localisedBank', () => {
  it('returns the source bank unchanged for English', () => {
    expect(localisedBank('en')).toEqual(footballBank)
  })

  it('keeps ids, order, difficulty and category identical across locales', () => {
    for (const locale of LOCALES) {
      const bank = localisedBank(locale)
      expect(bank.map((q) => q.id)).toEqual(footballBank.map((q) => q.id))
      expect(bank.map((q) => q.difficulty)).toEqual(footballBank.map((q) => q.difficulty))
      expect(bank.map((q) => q.category)).toEqual(footballBank.map((q) => q.category))
    }
  })

  it('gives every entry four distinct answers in every locale', () => {
    for (const locale of LOCALES) {
      const broken = localisedBank(locale).filter(
        (q) => new Set([q.correctAnswer, ...q.wrongAnswers]).size !== 4,
      )
      expect(broken.map((q) => `${locale}:${q.id}`)).toEqual([])
    }
  })

  it('never leaves a prompt or answer blank', () => {
    for (const locale of LOCALES) {
      const blank = localisedBank(locale).filter(
        (q) =>
          q.prompt.trim() === '' ||
          q.correctAnswer.trim() === '' ||
          q.wrongAnswers.some((a) => a.trim() === ''),
      )
      expect(blank.map((q) => `${locale}:${q.id}`)).toEqual([])
    }
  })

  it('is stable across calls', () => {
    expect(localisedBank('de')).toBe(localisedBank('de'))
  })
})

describe('translation coverage', () => {
  // Ids are index-derived, so a translated topic that is a different length
  // from its English source has drifted out of alignment and would attach the
  // wrong text to a question id.
  it.each(LOCALES.filter((l) => l !== 'en'))('%s covers every topic entry for entry', (locale) => {
    const translations = TRANSLATIONS[locale]
    const mismatches = TOPICS.filter(
      ([prefix, , entries]) => translations?.[prefix]?.length !== entries.length,
    ).map(([prefix, , entries]) => ({
      topic: prefix,
      expected: entries.length,
      actual: translations?.[prefix]?.length ?? 0,
    }))
    expect(mismatches).toEqual([])
  })
})

describe('questionFromRef', () => {
  const entry = footballBank[0]

  it('rebuilds the question with its answers in the given order', () => {
    const question = questionFromRef({ id: entry.id, answerOrder: [2, 0, 3, 1] }, 'en')
    const canonical = [entry.correctAnswer, ...entry.wrongAnswers]
    expect(question).not.toBeNull()
    expect(question?.answers).toEqual([canonical[2], canonical[0], canonical[3], canonical[1]])
    expect(question?.correctAnswer).toBe(entry.correctAnswer)
  })

  it('renders the same id in another locale, keeping the correct answer in the same slot', () => {
    const order = [1, 0, 3, 2]
    const english = questionFromRef({ id: entry.id, answerOrder: order }, 'en')
    const german = questionFromRef({ id: entry.id, answerOrder: order }, 'de')
    expect(english).not.toBeNull()
    expect(german).not.toBeNull()
    expect(german!.answers.indexOf(german!.correctAnswer)).toBe(
      english!.answers.indexOf(english!.correctAnswer),
    )
  })

  it('returns null for an id this build does not have', () => {
    expect(questionFromRef({ id: 'zz-9999', answerOrder: [0, 1, 2, 3] }, 'en')).toBeNull()
  })

  it.each([
    ['too short', [0, 1, 2]],
    ['too long', [0, 1, 2, 3, 0]],
    ['duplicated index', [0, 0, 1, 2]],
    ['out of range', [0, 1, 2, 4]],
    ['negative', [0, 1, 2, -1]],
  ])('returns null for an answer order that is %s', (_label, order) => {
    expect(questionFromRef({ id: entry.id, answerOrder: order }, 'en')).toBeNull()
  })
})

describe('questionsFromRefs', () => {
  it('drops refs it cannot render rather than failing the batch', () => {
    const refs = [
      { id: footballBank[0].id, answerOrder: [0, 1, 2, 3] },
      { id: 'zz-9999', answerOrder: [0, 1, 2, 3] },
      { id: footballBank[1].id, answerOrder: [3, 2, 1, 0] },
    ]
    expect(questionsFromRefs(refs, 'en').map((q) => q.id)).toEqual([
      footballBank[0].id,
      footballBank[1].id,
    ])
  })
})

describe('refFromQuestion', () => {
  it('round-trips a question through the wire form', () => {
    const entry = footballBank[5]
    const original = questionFromRef({ id: entry.id, answerOrder: [1, 3, 0, 2] }, 'en')!
    const ref = refFromQuestion(original, entry)
    expect(ref).toEqual({ id: entry.id, answerOrder: [1, 3, 0, 2] })
    expect(questionFromRef(ref, 'en')).toEqual(original)
  })
})
