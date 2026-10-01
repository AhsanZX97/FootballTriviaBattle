import { describe, expect, it } from 'vitest'
import { bankForMatch, footballBank } from '../index'
import { localisedBank, questionFromRef } from '../localised'
import { sampleQuestions } from '../../sampler'

const allPictures = footballBank.filter((entry) => entry.image)
const pictures = allPictures.filter((entry) => entry.id.startsWith('pp-'))
const crests = allPictures.filter((entry) => entry.id.startsWith('pt-'))

describe('picture questions', () => {
  it('are part of the shared bank with a portrait key and the player as the answer', () => {
    expect(pictures.length).toBeGreaterThanOrEqual(100)
    const ronaldo = pictures.find((entry) => entry.correctAnswer === 'Cristiano Ronaldo')
    expect(ronaldo?.image).toBe('cristiano-ronaldo')
    expect(ronaldo?.id).toMatch(/^pp-/)
  })

  it('never list the correct player among their own wrong answers', () => {
    for (const entry of pictures) {
      expect(new Set([entry.correctAnswer, ...entry.wrongAnswers]).size).toBe(4)
    }
  })

  it('have a portrait file for every entry and spread difficulty by fame', () => {
    const files = Object.keys(import.meta.glob('../../../../assets/players/*.webp'))
    for (const entry of pictures) {
      expect(files.some((f) => f.endsWith(`/${entry.image}.webp`))).toBe(true)
    }
    const count = (d: string) => pictures.filter((e) => e.difficulty === d).length
    expect(count('easy')).toBeGreaterThan(0)
    expect(count('medium')).toBeGreaterThan(0)
    expect(count('hard')).toBeGreaterThan(0)
    expect(pictures.find((e) => e.correctAnswer === 'Lionel Messi')?.difficulty).toBe('easy')
  })

  it('carry the portrait key into sampled and wire-rebuilt questions', () => {
    const [entry] = pictures
    const sampled = sampleQuestions([entry], 1)[0]
    expect(sampled.image).toBe(entry.image)
    const rebuilt = questionFromRef({ id: entry.id, answerOrder: [0, 1, 2, 3] }, 'en')
    expect(rebuilt?.image).toBe(entry.image)
  })

  it('are only offered to a match when every player supports them', () => {
    expect(bankForMatch(footballBank, true)).toEqual(footballBank)
    const textOnly = bankForMatch(footballBank, false)
    expect(textOnly.some((entry) => entry.image)).toBe(false)
    expect(textOnly).toHaveLength(footballBank.length - allPictures.length)
  })

  it('stay in every locale, falling back to English text', () => {
    expect(localisedBank('es').filter((entry) => entry.image)).toHaveLength(allPictures.length)
  })
})

describe('club crest questions', () => {
  it('are in the shared bank with a teams/ key and the club as the answer', () => {
    expect(crests.length).toBeGreaterThanOrEqual(100)
    for (const entry of crests) {
      expect(entry.image).toMatch(/^teams\//)
      expect(new Set([entry.correctAnswer, ...entry.wrongAnswers]).size).toBe(4)
    }
  })

  it('are withheld from a match unless every player declared crest support', () => {
    const noCrests = bankForMatch(footballBank, true, false)
    expect(noCrests.some((entry) => entry.image?.startsWith('teams/'))).toBe(false)
    expect(noCrests.filter((entry) => entry.id.startsWith('pp-'))).toHaveLength(pictures.length)
  })

  it('have a crest file for every entry', () => {
    const files = Object.keys(import.meta.glob('../../../../assets/teams/*.webp'))
    for (const entry of crests) {
      const stem = entry.image!.slice('teams/'.length)
      expect(files.some((f) => f.endsWith(`/${stem}.webp`))).toBe(true)
    }
  })
})
