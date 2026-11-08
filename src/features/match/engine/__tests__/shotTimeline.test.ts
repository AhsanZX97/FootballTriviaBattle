import { describe, expect, it } from 'vitest'
import { ShotTimeline, impactTime, shotPose, strikerKickFrame, strikerRunPose, FEEDBACK_MS, KICK_MS, PENALTY_SPOT, STRIKE_LEAD_MS, STRIKER_KICK_SPOT, STRIKER_SPOT } from '../shotTimeline'

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

  it('launches from a given spot instead of the default one', () => {
    expect(shotPose('goal', 999, 'wrong-way', false, PENALTY_SPOT).ball).toEqual(PENALTY_SPOT)
    expect(PENALTY_SPOT.y).toBeLessThan(0.8)
    expect(shotPose('goal', 1700, 'wrong-way', false, PENALTY_SPOT).ball).toEqual({ x: 0.39, y: 0.38 })
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

  it('runs the striker up, strikes on the kick, then settles on his last frame', () => {
    expect(strikerKickFrame(0)).toBe(0)
    // The strike pose lands a beat BEFORE the ball leaves, so the toe is seen
    // touching the ball first instead of the ball launching off a gap.
    expect(strikerKickFrame(KICK_MS - STRIKE_LEAD_MS - 1)).toBe(2)
    expect(strikerKickFrame(KICK_MS - STRIKE_LEAD_MS)).toBe(3)
    expect(strikerKickFrame(KICK_MS)).toBe(3)
    expect(strikerRunPose(KICK_MS - STRIKE_LEAD_MS)).toMatchObject({ x: STRIKER_KICK_SPOT.x, y: STRIKER_KICK_SPOT.y })
    expect(strikerKickFrame(FEEDBACK_MS)).toBe(5)
    const frames = Array.from({ length: FEEDBACK_MS / 10 }, (_, i) => strikerKickFrame(i * 10))
    expect(frames).toEqual([...frames].sort((a, b) => a - b))
  })

  it('runs the striker from his idle spot up to the ball, shrinking as he goes', () => {
    const start = strikerRunPose(0)
    const kick = strikerRunPose(KICK_MS - STRIKE_LEAD_MS)
    expect(start).toMatchObject({ x: STRIKER_SPOT.x, y: STRIKER_SPOT.y, scale: 1 })
    expect(kick).toMatchObject({ x: STRIKER_KICK_SPOT.x, y: STRIKER_KICK_SPOT.y })
    expect(kick.x).toBeGreaterThan(start.x)
    expect(kick.y).toBeLessThan(start.y)
    // a gentle perspective shrink for a short move: noticeable, not dramatic
    expect(kick.scale).toBeLessThan(0.95)
    expect(kick.scale).toBeGreaterThan(0.8)
    expect(Math.abs(kick.x - PENALTY_SPOT.x)).toBeLessThan(0.08)
    expect(Math.abs(kick.y - PENALTY_SPOT.y)).toBeLessThan(0.08)
  })

  it.each(['goal', 'miss', 'save', 'concede'] as const)('shrinks a %s as it flies away from the camera', (outcome) => {
    expect(shotPose(outcome, KICK_MS).ballScale).toBe(1)
    let previous = 1
    for (let t = KICK_MS; t <= impactTime(outcome); t += 50) {
      const { ballScale } = shotPose(outcome, t)
      expect(ballScale).toBeLessThanOrEqual(previous)
      previous = ballScale
    }
    // a slight perspective shrink only: noticeable, never halved
    expect(previous).toBeLessThan(0.9)
    expect(previous).toBeGreaterThan(0.7)
  })

  it('plants the striker so his kicking foot meets the ball on the strike frame', () => {
    // Measured from strike frame 3 of striker-shoot-strip.png (485px cells, feet at y=455):
    // the toe is 155px right of the body centre and ~160px above the feet line.
    // Drawn height = idle width 0.043W * (485 / 187.5) * kick scale; the pitch is 16:9.
    const pxToW = (0.043 * (485 / 187.5) * strikerRunPose(KICK_MS).scale) / 485
    const toe = {
      x: STRIKER_KICK_SPOT.x + 155 * pxToW,
      y: STRIKER_KICK_SPOT.y - (160 * pxToW) / (9 / 16),
    }
    const ballRadius = 0.049 * 0.45 / 2
    // The boot sits well into the ball (not just touching its edge), but short of its centre.
    expect(toe.x).toBeGreaterThanOrEqual(PENALTY_SPOT.x - ballRadius * 0.6)
    expect(toe.x).toBeLessThanOrEqual(PENALTY_SPOT.x - ballRadius * 0.2)
    expect(Math.abs(toe.y - PENALTY_SPOT.y)).toBeLessThan(0.008)
    expect(strikerKickFrame(KICK_MS)).toBe(3)
  })

  it('supports frozen and late goal reactions without changing the ball outcome', () => {
    expect(shotPose('goal', 1800, 'frozen').keeper).toEqual({ x: 0.5, y: 0.51 })
    expect(shotPose('goal', 1000, 'late').diving).toBe(false)
    expect(shotPose('goal', 1700, 'late').diving).toBe(true)
  })
})
