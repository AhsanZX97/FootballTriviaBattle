import { describe, expect, it } from 'vitest'
import { MAX_NAME_LENGTH } from '../../../types/multiplayer'
import { randomName } from '../randomName'

describe('randomName', () => {
  it('generates an "ADJECTIVE NOUN NN" name within MAX_NAME_LENGTH', () => {
    for (let i = 0; i < 50; i++) {
      const name = randomName()
      expect(name).toMatch(/^[A-Z]+ [A-Z]+ \d{2}$/)
      expect(name.length).toBeLessThanOrEqual(MAX_NAME_LENGTH)
    }
  })

  it('varies across calls', () => {
    const names = new Set(Array.from({ length: 30 }, () => randomName()))
    expect(names.size).toBeGreaterThan(1)
  })
})
