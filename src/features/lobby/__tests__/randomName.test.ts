import { describe, expect, it } from 'vitest'
import { MAX_NAME_LENGTH } from '../../../types/multiplayer'
import { randomName } from '../randomName'

/** Deterministic rng seam so a shape can be forced without looping forever. */
function seeded(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

const sample = (n: number) => Array.from({ length: n }, () => randomName())

describe('randomName', () => {
  it('stays inside the handle charset and length limits', () => {
    for (const name of sample(400)) {
      expect(name).toMatch(/^[A-Za-z][A-Za-z0-9_]*[A-Za-z0-9]$/)
      expect(name.length).toBeGreaterThanOrEqual(3)
      expect(name.length).toBeLessThanOrEqual(MAX_NAME_LENGTH)
    }
  })

  it('is dominated by no single shape', () => {
    const names = sample(400)
    const withDigits = names.filter((n) => /\d/.test(n)).length
    const withUnderscore = names.filter((n) => n.includes('_')).length
    // Both decorations show up, and neither is the house style.
    expect(withDigits).toBeGreaterThan(0)
    expect(withDigits).toBeLessThan(names.length * 0.6)
    expect(withUnderscore).toBeGreaterThan(0)
    expect(withUnderscore).toBeLessThan(names.length * 0.6)
  })

  it('varies casing rather than shouting every name', () => {
    const names = sample(400)
    expect(names.some((n) => n === n.toLowerCase())).toBe(true)
    expect(names.some((n) => n === n.toUpperCase())).toBe(true)
    expect(names.some((n) => n !== n.toLowerCase() && n !== n.toUpperCase())).toBe(true)
  })

  it('draws from a wide space rather than a small word list', () => {
    const names = sample(400)
    const stems = new Set(names.map((n) => n.toLowerCase().replace(/[^a-z]/g, '')))
    // A word-pair generator would collide constantly at this sample size.
    expect(stems.size).toBeGreaterThan(380)
  })

  it('produces pronounceable stems, not letter soup', () => {
    for (const name of sample(200)) {
      const letters = name.toLowerCase().replace(/[^a-z]/g, '')
      expect(letters).toMatch(/[aeiouy]/)
      expect(letters).not.toMatch(/[bcdfgjklmnpqrstvwxz]{4}/)
    }
  })

  it('is reproducible for a given rng', () => {
    expect(randomName(seeded(42))).toBe(randomName(seeded(42)))
    expect(randomName(seeded(1))).not.toBe(randomName(seeded(2)))
  })
})
