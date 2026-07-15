import { describe, expect, it } from 'vitest'
import { settleMatch } from '../awards'
import { KICKS_PER_SIDE } from '../../src/game/shootout'

const bothAuthed = { aUserId: 'user-a', bUserId: 'user-b' }
const aAnon = { aUserId: null, bUserId: 'user-b' }
const bAnon = { aUserId: 'user-a', bUserId: null }
const bothAnon = { aUserId: null, bUserId: null }

// A full standard match; well past the early-forfeit cutoff.
const FULL = KICKS_PER_SIDE * 2
// Exactly halfway — the first kick count that still pays out on a forfeit.
const HALFWAY = KICKS_PER_SIDE
// Score irrelevant (used where the early-forfeit gate doesn't apply).
const TIED = { a: 0, b: 0 }

describe('settleMatch — completed matches', () => {
  it('pays the winner 3 and the completed loser 1 when a wins, both authed', () => {
    expect(settleMatch('won', bothAuthed, 'completed', FULL, TIED)).toEqual(
      expect.arrayContaining([
        { userId: 'user-a', amount: 3 },
        { userId: 'user-b', amount: 1 },
      ]),
    )
  })

  it('pays the winner 3 and the completed loser 1 when b wins, both authed', () => {
    expect(settleMatch('lost', bothAuthed, 'completed', FULL, TIED)).toEqual(
      expect.arrayContaining([
        { userId: 'user-a', amount: 1 },
        { userId: 'user-b', amount: 3 },
      ]),
    )
  })

  it('omits the anonymous winner but still pays the authed completed loser', () => {
    expect(settleMatch('won', aAnon, 'completed', FULL, TIED)).toEqual([
      { userId: 'user-b', amount: 1 },
    ])
  })

  it('omits the anonymous loser but still pays the authed winner', () => {
    expect(settleMatch('won', bAnon, 'completed', FULL, TIED)).toEqual([
      { userId: 'user-a', amount: 3 },
    ])
  })

  it('returns nothing when both players are anonymous', () => {
    expect(settleMatch('won', bothAnon, 'completed', FULL, TIED)).toEqual([])
  })
})

describe('settleMatch — forfeits', () => {
  it('pays the winner 3 and the quitter 0 on forfeitA (a left, b wins)', () => {
    // room.ts's forfeit() sets shootout.status relative to the winner, so a
    // leaving means status is 'lost' (a did not win).
    expect(settleMatch('lost', bothAuthed, 'forfeitA', FULL, TIED)).toEqual(
      expect.arrayContaining([
        { userId: 'user-a', amount: 0 },
        { userId: 'user-b', amount: 3 },
      ]),
    )
  })

  it('pays the winner 3 and the quitter 0 on forfeitB (b left, a wins)', () => {
    expect(settleMatch('won', bothAuthed, 'forfeitB', FULL, TIED)).toEqual(
      expect.arrayContaining([
        { userId: 'user-a', amount: 3 },
        { userId: 'user-b', amount: 0 },
      ]),
    )
  })

  it('omits the anonymous quitter but still pays the authed winner', () => {
    expect(settleMatch('won', bAnon, 'forfeitB', FULL, TIED)).toEqual([
      { userId: 'user-a', amount: 3 },
    ])
  })

  it('returns nothing when both players are anonymous', () => {
    expect(settleMatch('won', bothAnon, 'forfeitB', FULL, TIED)).toEqual([])
  })
})

describe('settleMatch — early forfeits', () => {
  it('pays nobody when the disconnect happens before halfway and the scores are level', () => {
    expect(settleMatch('won', bothAuthed, 'forfeitB', HALFWAY - 1, { a: 1, b: 1 })).toEqual([])
    expect(settleMatch('lost', bothAuthed, 'forfeitA', 0, TIED)).toEqual([])
  })

  it('pays nobody when the player left behind was trailing', () => {
    // b quits early (a wins by forfeit) but a was behind 0-2 — nobody earns.
    expect(settleMatch('won', bothAuthed, 'forfeitB', HALFWAY - 1, { a: 0, b: 2 })).toEqual([])
  })

  it('still pays the player left behind if they were leading', () => {
    // b quits early, a was ahead 2-0 — a earned the win.
    expect(settleMatch('won', bothAuthed, 'forfeitB', HALFWAY - 1, { a: 2, b: 0 })).toEqual(
      expect.arrayContaining([{ userId: 'user-a', amount: 3 }]),
    )
    // symmetric: a quits early, b was ahead 3-1 — b earned the win.
    expect(settleMatch('lost', bothAuthed, 'forfeitA', HALFWAY - 1, { a: 1, b: 3 })).toEqual(
      expect.arrayContaining([{ userId: 'user-b', amount: 3 }]),
    )
  })

  it('still pays the winner once the match reaches halfway, regardless of lead', () => {
    expect(settleMatch('won', bothAuthed, 'forfeitB', HALFWAY, { a: 0, b: 1 })).toEqual(
      expect.arrayContaining([{ userId: 'user-a', amount: 3 }]),
    )
  })

  it('never gates a completed match on kick count', () => {
    // A completed match that somehow ended in few kicks still settles normally.
    expect(settleMatch('won', bothAuthed, 'completed', 0, TIED)).toEqual(
      expect.arrayContaining([
        { userId: 'user-a', amount: 3 },
        { userId: 'user-b', amount: 1 },
      ]),
    )
  })
})
