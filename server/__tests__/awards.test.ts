import { describe, expect, it } from 'vitest'
import { settleMatch } from '../awards'

const bothAuthed = { aUserId: 'user-a', bUserId: 'user-b' }
const aAnon = { aUserId: null, bUserId: 'user-b' }
const bAnon = { aUserId: 'user-a', bUserId: null }
const bothAnon = { aUserId: null, bUserId: null }

describe('settleMatch — completed matches', () => {
  it('pays the winner 3 and the completed loser 1 when a wins, both authed', () => {
    expect(settleMatch('won', bothAuthed, 'completed')).toEqual(
      expect.arrayContaining([
        { userId: 'user-a', amount: 3 },
        { userId: 'user-b', amount: 1 },
      ]),
    )
  })

  it('pays the winner 3 and the completed loser 1 when b wins, both authed', () => {
    expect(settleMatch('lost', bothAuthed, 'completed')).toEqual(
      expect.arrayContaining([
        { userId: 'user-a', amount: 1 },
        { userId: 'user-b', amount: 3 },
      ]),
    )
  })

  it('omits the anonymous winner but still pays the authed completed loser', () => {
    expect(settleMatch('won', aAnon, 'completed')).toEqual([{ userId: 'user-b', amount: 1 }])
  })

  it('omits the anonymous loser but still pays the authed winner', () => {
    expect(settleMatch('won', bAnon, 'completed')).toEqual([{ userId: 'user-a', amount: 3 }])
  })

  it('returns nothing when both players are anonymous', () => {
    expect(settleMatch('won', bothAnon, 'completed')).toEqual([])
  })
})

describe('settleMatch — forfeits', () => {
  it('pays the winner 3 and the quitter 0 on forfeitA (a left, b wins)', () => {
    // room.ts's forfeit() sets shootout.status relative to the winner, so a
    // leaving means status is 'lost' (a did not win).
    expect(settleMatch('lost', bothAuthed, 'forfeitA')).toEqual(
      expect.arrayContaining([
        { userId: 'user-a', amount: 0 },
        { userId: 'user-b', amount: 3 },
      ]),
    )
  })

  it('pays the winner 3 and the quitter 0 on forfeitB (b left, a wins)', () => {
    expect(settleMatch('won', bothAuthed, 'forfeitB')).toEqual(
      expect.arrayContaining([
        { userId: 'user-a', amount: 3 },
        { userId: 'user-b', amount: 0 },
      ]),
    )
  })

  it('omits the anonymous quitter but still pays the authed winner', () => {
    expect(settleMatch('won', bAnon, 'forfeitB')).toEqual([{ userId: 'user-a', amount: 3 }])
  })

  it('returns nothing when both players are anonymous', () => {
    expect(settleMatch('won', bothAnon, 'forfeitB')).toEqual([])
  })
})
