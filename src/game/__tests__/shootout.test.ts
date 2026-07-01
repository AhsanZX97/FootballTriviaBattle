import { describe, expect, it } from 'vitest'
import type { ShootoutState } from '../../types/match'
import { applyAnswer, createInitialState, isMatchOver, nextStage } from '../shootout'

const play = (answers: boolean[]): ShootoutState =>
  answers.reduce<ShootoutState>((s, a) => applyAnswer(s, a), createInitialState())

describe('createInitialState', () => {
  it('starts level, with the user shooting first', () => {
    const s = createInitialState()
    expect(s).toEqual({ userScore: 0, cpuScore: 0, stage: 'shoot', kicks: [], status: 'playing' })
  })
})

describe('nextStage', () => {
  it('alternates shoot and keep', () => {
    expect(nextStage('shoot')).toBe('keep')
    expect(nextStage('keep')).toBe('shoot')
  })
})

describe('applyAnswer', () => {
  it('scores for the user and advances to keeper on a correct shot', () => {
    const s = applyAnswer(createInitialState(), true)
    expect(s.userScore).toBe(1)
    expect(s.stage).toBe('keep')
    expect(s.status).toBe('playing')
  })

  it('lets the CPU score when the user concedes as keeper', () => {
    const s = play([false, false]) // miss shot, then concede as keeper
    expect(s.userScore).toBe(0)
    expect(s.cpuScore).toBe(1)
  })

  it('wins the match after the standard phase when the user leads', () => {
    const s = play(Array(10).fill(true)) // every shot scored, every shot saved
    expect(s.status).toBe('won')
    expect(s.userScore).toBe(5)
    expect(s.cpuScore).toBe(0)
    expect(isMatchOver(s)).toBe(true)
  })

  it('goes to sudden death when level after five kicks each', () => {
    const s = play([true, false, true, false, true, false, true, false, true, false])
    expect(s.userScore).toBe(5)
    expect(s.cpuScore).toBe(5)
    expect(s.status).toBe('playing') // not over: sudden death
    expect(s.kicks).toHaveLength(10)
  })

  it('wins in sudden death when the user leads after a full round', () => {
    const tie = [true, false, true, false, true, false, true, false, true, false]
    const s = play([...tie, true, true]) // user scores, then saves
    expect(s.status).toBe('won')
    expect(s.userScore).toBe(6)
    expect(s.cpuScore).toBe(5)
  })

  it('does not end sudden death mid-round (user shoots, CPU yet to kick)', () => {
    const tie = [true, false, true, false, true, false, true, false, true, false]
    const s = play([...tie, true]) // only the user has kicked in this SD round
    expect(s.status).toBe('playing')
  })

  it('loses in sudden death when the user trails after a full round', () => {
    const tie = [true, false, true, false, true, false, true, false, true, false]
    const s = play([...tie, false, false]) // miss, then concede
    expect(s.status).toBe('lost')
    expect(s.userScore).toBe(5)
    expect(s.cpuScore).toBe(6)
  })

  it('is a no-op once the match is over', () => {
    const won = play(Array(10).fill(true))
    expect(applyAnswer(won, false)).toBe(won)
  })
})
