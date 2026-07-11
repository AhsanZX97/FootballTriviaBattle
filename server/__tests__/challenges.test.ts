import { describe, expect, it } from 'vitest'
import { createChallengeStore } from '../challenges'
import type { PendingChallenge } from '../challenges'

const challenge = (id: string, challenger: string, target: string): PendingChallenge => ({
  id,
  challengerConnId: challenger,
  targetConnId: target,
  createdAt: 0,
})

describe('challenge store', () => {
  it('adds and gets a challenge by id', () => {
    const store = createChallengeStore()
    store.add(challenge('c1', 'a', 'b'))
    expect(store.get('c1')).toMatchObject({ challengerConnId: 'a', targetConnId: 'b' })
  })

  it('remove returns the challenge and drops it', () => {
    const store = createChallengeStore()
    store.add(challenge('c1', 'a', 'b'))
    expect(store.remove('c1')).toMatchObject({ id: 'c1' })
    expect(store.get('c1')).toBeUndefined()
  })

  it('remove returns undefined for an unknown id', () => {
    const store = createChallengeStore()
    expect(store.remove('nope')).toBeUndefined()
  })

  it('finds a challenger\'s outstanding outgoing challenge', () => {
    const store = createChallengeStore()
    store.add(challenge('c1', 'a', 'b'))
    expect(store.outgoingFor('a')?.id).toBe('c1')
    // 'b' is the target here, not a challenger
    expect(store.outgoingFor('b')).toBeUndefined()
  })

  it('removeInvolving drops challenges where the connection is challenger or target', () => {
    const store = createChallengeStore()
    store.add(challenge('c1', 'a', 'b')) // a challenges b
    store.add(challenge('c2', 'c', 'a')) // c challenges a
    store.add(challenge('c3', 'd', 'e')) // unrelated
    const removed = store.removeInvolving('a').map((c) => c.id).sort()
    expect(removed).toEqual(['c1', 'c2'])
    expect(store.get('c1')).toBeUndefined()
    expect(store.get('c2')).toBeUndefined()
    expect(store.get('c3')).toMatchObject({ id: 'c3' })
  })
})
