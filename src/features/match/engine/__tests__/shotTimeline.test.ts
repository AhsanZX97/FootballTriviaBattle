import { describe, expect, it } from 'vitest'
import { ShotTimeline, shotPose, FEEDBACK_MS } from '../shotTimeline'

describe('engine shot timeline', () => {
  it.each(['goal', 'miss', 'save', 'concede'] as const)('%s launches, lands and completes once', (outcome) => {
    const shot = new ShotTimeline(outcome)
    expect(shot.advance(999)).toEqual([])
    expect(shot.advance(1)).toEqual(['kick'])
    const flight = outcome === 'save' ? 500 : 700
    expect(shot.advance(flight - 1)).toEqual([])
    expect(shot.advance(1)).toEqual(['impact'])
    expect(shot.advance(FEEDBACK_MS)).toEqual(['complete'])
    expect(shot.advance(FEEDBACK_MS)).toEqual([])
  })

  it('delivers every crossed milestone in order after a delayed frame', () => {
    const shot = new ShotTimeline('goal')
    expect(shot.advance(5000)).toEqual(['kick', 'impact', 'complete'])
    expect(shot.advance(16)).toEqual([])
  })

  it('holds at the penalty spot during suspense, then moves into the net', () => {
    expect(shotPose('goal', 999, 'wrong-way').ball).toEqual({ x: 0.5, y: 0.8 })
    expect(shotPose('goal', 1700, 'wrong-way').ball).toEqual({ x: 0.39, y: 0.38 })
    expect(shotPose('goal', 1700, 'wrong-way').keeper.x).toBe(0.6)
  })

  it('saves at the keeper, misses outside the posts, and concedes opposite the dive', () => {
    expect(shotPose('save', 1500).ball).toEqual({ x: 0.39, y: 0.47 })
    expect(shotPose('save', 1500).keeper.x).toBe(0.4)
    expect(shotPose('miss', 1700).ball.x).toBeGreaterThan(0.66)
    expect(shotPose('concede', 1700).ball.x).toBe(0.61)
    expect(shotPose('concede', 1700).keeper.x).toBe(0.42)
  })

  it.each(['goal', 'miss', 'save', 'concede'] as const)('mirrors a %s to the other side of the goal', (outcome) => {
    const left = shotPose(outcome, 1800, 'wrong-way', false)
    const right = shotPose(outcome, 1800, 'wrong-way', true)
    expect(right.ball.x).toBeCloseTo(1 - left.ball.x)
    expect(right.ball.y).toBe(left.ball.y)
    expect(right.keeper.x).toBeCloseTo(1 - left.keeper.x)
    if (left.diving) expect(right.flipKeeper).toBe(!left.flipKeeper)
  })

  it('supports frozen and late goal reactions without changing the ball outcome', () => {
    expect(shotPose('goal', 1800, 'frozen').keeper).toEqual({ x: 0.5, y: 0.51 })
    expect(shotPose('goal', 1000, 'late').diving).toBe(false)
    expect(shotPose('goal', 1700, 'late').diving).toBe(true)
  })
})
