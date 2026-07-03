import { describe, expect, it } from 'vitest'
import { activeSlot, applyKick, createRoom, forfeit, voteRematch } from '../room'

const playerA = { id: 'a', name: 'Alice' }
const playerB = { id: 'b', name: 'Bob' }

describe('createRoom', () => {
  it('assigns slots by the xGoesFirst coin flip', () => {
    expect(createRoom(playerA, playerB, true).players).toEqual({ a: playerA, b: playerB })
    expect(createRoom(playerA, playerB, false).players).toEqual({ a: playerB, b: playerA })
  })

  it('starts with slot a to kick', () => {
    expect(activeSlot(createRoom(playerA, playerB, true).shootout)).toBe('a')
  })
})

describe('applyKick', () => {
  it('scores for slot a when a scores on its kick, then hands the turn to b', () => {
    const room = applyKick(createRoom(playerA, playerB, true), 'a', true)
    expect(room.shootout.userScore).toBe(1)
    expect(activeSlot(room.shootout)).toBe('b')
  })

  it('scores for slot b when b scores on its kick', () => {
    let room = createRoom(playerA, playerB, true)
    room = applyKick(room, 'a', false) // a misses
    room = applyKick(room, 'b', true) // b scores
    expect(room.shootout.cpuScore).toBe(1)
    expect(activeSlot(room.shootout)).toBe('a')
  })

  it('is a no-op when the wrong slot tries to kick', () => {
    const room = createRoom(playerA, playerB, true)
    const attempt = applyKick(room, 'b', true)
    expect(attempt).toBe(room)
  })

  it('is a no-op once the match is over', () => {
    let room = createRoom(playerA, playerB, true)
    for (let i = 0; i < 5; i++) {
      room = applyKick(room, 'a', true)
      room = applyKick(room, 'b', false)
    }
    expect(room.shootout.status).toBe('won')
    const attempt = applyKick(room, 'a', true)
    expect(attempt).toBe(room)
  })
})

describe('forfeit', () => {
  it('awards the win to the other slot', () => {
    const room = createRoom(playerA, playerB, true)
    expect(forfeit(room, 'a').shootout.status).toBe('lost')
    expect(forfeit(room, 'b').shootout.status).toBe('won')
  })

  it('is a no-op once the match is already over', () => {
    let room = createRoom(playerA, playerB, true)
    for (let i = 0; i < 5; i++) {
      room = applyKick(room, 'a', true)
      room = applyKick(room, 'b', false)
    }
    const attempt = forfeit(room, 'a')
    expect(attempt).toBe(room)
  })
})

describe('voteRematch', () => {
  const finishedRoom = () => {
    let room = createRoom(playerA, playerB, true)
    for (let i = 0; i < 5; i++) {
      room = applyKick(room, 'a', true)
      room = applyKick(room, 'b', false)
    }
    return room
  }

  it('reports waiting after only one slot has voted', () => {
    const { room, outcome } = voteRematch(finishedRoom(), 'a')
    expect(outcome).toBe('waiting')
    expect(room.rematchVotes.size).toBe(1)
  })

  it('resets the shootout once both slots have voted', () => {
    let result = voteRematch(finishedRoom(), 'a')
    result = voteRematch(result.room, 'b', () => false)
    expect(result.outcome).toBe('ready')
    expect(result.room.shootout.status).toBe('playing')
    expect(result.room.shootout.userScore).toBe(0)
    expect(result.room.rematchVotes.size).toBe(0)
  })

  it('keeps slot assignment when the coin flip says no swap', () => {
    let result = voteRematch(finishedRoom(), 'a')
    result = voteRematch(result.room, 'b', () => false)
    expect(result.room.players).toEqual({ a: playerA, b: playerB })
  })

  it('swaps slot assignment when the coin flip says swap', () => {
    let result = voteRematch(finishedRoom(), 'a')
    result = voteRematch(result.room, 'b', () => true)
    expect(result.room.players).toEqual({ a: playerB, b: playerA })
  })
})
