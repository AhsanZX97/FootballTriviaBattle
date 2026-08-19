import { describe, expect, it } from 'vitest'
import {
  parseAccessToken,
  parsePlayer,
  slugUsername,
  syntheticEmail,
  usernameCandidates,
  withSuffix,
  USERNAME_MAX,
} from '../pgs'

describe('parseAccessToken', () => {
  it('returns the token from a well-formed response', () => {
    expect(parseAccessToken({ access_token: 'ya29.abc' })).toBe('ya29.abc')
  })

  it('returns null for a missing, empty or non-string token', () => {
    expect(parseAccessToken({})).toBeNull()
    expect(parseAccessToken({ access_token: '' })).toBeNull()
    expect(parseAccessToken({ access_token: 42 })).toBeNull()
    expect(parseAccessToken(null)).toBeNull()
    expect(parseAccessToken('nope')).toBeNull()
  })
})

describe('parsePlayer', () => {
  it('reads the player id and display name', () => {
    expect(parsePlayer({ playerId: 'p1', displayName: 'Ahsan' })).toEqual({
      playerId: 'p1',
      displayName: 'Ahsan',
    })
  })

  it('tolerates a missing display name', () => {
    expect(parsePlayer({ playerId: 'p1' })).toEqual({ playerId: 'p1', displayName: '' })
  })

  it('returns null without a usable player id', () => {
    expect(parsePlayer({ displayName: 'Ahsan' })).toBeNull()
    expect(parsePlayer({ playerId: '' })).toBeNull()
    expect(parsePlayer(null)).toBeNull()
  })
})

describe('slugUsername', () => {
  it('keeps an already-valid tag', () => {
    expect(slugUsername('Ahsan_99')).toBe('Ahsan_99')
  })

  it('replaces spaces and punctuation with underscores', () => {
    expect(slugUsername('Big Ahsan!')).toBe('Big_Ahsan')
  })

  it('strips accents rather than the letters under them', () => {
    expect(slugUsername('José')).toBe('Jose')
  })

  it('truncates to the column limit without a trailing underscore', () => {
    const slug = slugUsername('a_very_long_gamer_tag_indeed')
    expect(slug.length).toBeLessThanOrEqual(USERNAME_MAX)
    expect(slug.endsWith('_')).toBe(false)
  })

  it('returns empty when nothing usable survives', () => {
    expect(slugUsername('日本語')).toBe('')
    expect(slugUsername('!!')).toBe('')
    expect(slugUsername('ab')).toBe('')
  })
})

describe('withSuffix', () => {
  it('appends the suffix behind a separator', () => {
    expect(withSuffix('Ahsan', '42')).toBe('Ahsan_42')
  })

  it('trims the base so the result still fits', () => {
    const name = withSuffix('sixteen_char_nam', '1234')
    expect(name.length).toBeLessThanOrEqual(USERNAME_MAX)
    expect(name.endsWith('1234')).toBe(true)
  })

  it('falls back to a generated name when the base leaves nothing', () => {
    expect(withSuffix('', 'ab')).toBe('Player_ab')
  })
})

describe('usernameCandidates', () => {
  it('tries the gamer tag first, then suffixed variants', () => {
    expect(usernameCandidates('Ahsan', ['12', '34'])).toEqual(['Ahsan', 'Ahsan_12', 'Ahsan_34'])
  })

  it('generates Player names when the tag is unusable', () => {
    expect(usernameCandidates('日本語', ['12'])).toEqual(['Player_12'])
  })

  it('never proposes a name the column would reject', () => {
    for (const name of usernameCandidates('a_very_long_gamer_tag_indeed', ['9999'])) {
      expect(name.length).toBeGreaterThanOrEqual(3)
      expect(name.length).toBeLessThanOrEqual(USERNAME_MAX)
      expect(name).toMatch(/^[A-Za-z0-9_]+$/)
    }
  })
})

describe('syntheticEmail', () => {
  it('builds an unroutable address from the player id', () => {
    expect(syntheticEmail('p1')).toBe('pgs-p1@players.invalid')
  })
})
