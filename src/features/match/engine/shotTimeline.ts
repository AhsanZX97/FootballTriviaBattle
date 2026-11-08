export type SceneFeedback = 'goal' | 'miss' | 'save' | 'concede'
export type KeeperReaction = 'wrong-way' | 'frozen' | 'late'
export type ShotEvent = 'kick' | 'impact' | 'complete'
export const FEEDBACK_MS = 2600
export const KICK_MS = 1000
export const impactTime = (outcome: SceneFeedback) => outcome === 'save' ? 1500 : 1700

export class ShotTimeline {
  elapsed = 0
  private outcome: SceneFeedback

  constructor(outcome: SceneFeedback) {
    this.outcome = outcome
  }

  advance(delta: number): ShotEvent[] {
    const previous = this.elapsed
    this.elapsed += Math.max(0, delta)
    const milestones: Array<[number, ShotEvent]> = [
      [KICK_MS, 'kick'], [impactTime(this.outcome), 'impact'], [FEEDBACK_MS, 'complete'],
    ]
    return milestones.filter(([at]) => previous < at && this.elapsed >= at).map(([, event]) => event)
  }
}

/** The strike pose (frame 3) shows this long before the ball leaves, so the
 * toe is seen on the ball first; otherwise the leg-out frame reads as a gap. */
export const STRIKE_LEAD_MS = 50
const STRIKE_MS = KICK_MS - STRIKE_LEAD_MS

/** Frame of the six-frame kick strip; frame 3 is the strike, at STRIKE_MS. */
export function strikerKickFrame(elapsed: number) {
  if (elapsed < STRIKE_MS - 600) return 0
  if (elapsed < STRIKE_MS - 300) return 1
  if (elapsed < STRIKE_MS) return 2
  return Math.min(5, 3 + Math.floor((elapsed - STRIKE_MS) / 200))
}

type Point = { x: number; y: number }
export const BALL_START: Point = { x: 0.5, y: 0.8 }
/** Twelve yards out, between the six-yard line and the edge of the box. */
export const PENALTY_SPOT: Point = { x: 0.5, y: 0.74 }
/** Feet of a right-footed taker, back and to the left of the spot. */
export const STRIKER_SPOT: Point = { x: 0.42, y: 0.9 }
/** Where he strikes: back-left of the ball, placed so the toe of the strike
 * frame touches it (see the foot-meets-ball test). Further from the camera
 * than his idle spot, so he is drawn smaller there. */
export const STRIKER_KICK_SPOT: Point = { x: 0.461, y: 0.797 }
const KICK_SCALE = 0.88
/** Ball scale lost per unit of pitch height travelled towards the goal. */
const BALL_SHRINK_PER_Y = 0.5
const keeperStart = { x: 0.5, y: 0.51 }
const targets: Record<SceneFeedback, Point> = {
  goal: { x: 0.39, y: 0.38 },
  miss: { x: 0.73, y: 0.29 },
  save: { x: 0.39, y: 0.47 },
  concede: { x: 0.61, y: 0.39 },
}

function interpolate(start: Point, end: Point, progress: number): Point {
  if (progress >= 1) return end
  if (progress <= 0) return start
  return { x: start.x + (end.x - start.x) * progress, y: start.y + (end.y - start.y) * progress }
}

/** Reflects a pose across the centre line, so a shot can go to either side. */
const side = (point: Point, mirror: boolean): Point => (mirror ? { x: 1 - point.x, y: point.y } : point)

/** Position and scale of the striker during the run-up. He leaves his idle
 * spot at full size and runs up and to the right to the ball, shrinking as
 * he moves away from the camera. Same path for either shot direction: he is
 * right-footed and always approaches from the left; only the ball differs. */
export function strikerRunPose(elapsed: number) {
  const progress = Math.min(1, Math.max(0, elapsed / STRIKE_MS))
  const eased = progress * progress * (3 - 2 * progress) // ease-in-out
  return {
    x: STRIKER_SPOT.x + (STRIKER_KICK_SPOT.x - STRIKER_SPOT.x) * eased,
    y: STRIKER_SPOT.y + (STRIKER_KICK_SPOT.y - STRIKER_SPOT.y) * eased,
    scale: 1 + (KICK_SCALE - 1) * eased,
  }
}

export function shotPose(
  outcome: SceneFeedback,
  elapsed: number,
  reaction: KeeperReaction = 'wrong-way',
  mirror = false,
  start: Point = BALL_START,
) {
  const progress = Math.min(1, Math.max(0, (elapsed - KICK_MS) / (impactTime(outcome) - KICK_MS)))
  const diveStart = KICK_MS + (outcome === 'goal' && reaction === 'late' ? 350 : 0)
  const frozen = outcome === 'miss' || (outcome === 'goal' && reaction === 'frozen')
  const keeperTarget = side(
    outcome === 'save' ? { x: 0.4, y: 0.49 }
      : outcome === 'concede' ? { x: 0.42, y: 0.52 }
        : reaction === 'late' ? { x: 0.43, y: 0.52 } : { x: 0.6, y: 0.52 },
    mirror,
  )
  const ball = interpolate(start, side(targets[outcome], mirror), progress)
  return {
    ball,
    /** Perspective: the further up the pitch (towards the goal), the smaller. */
    ballScale: Math.min(1, Math.max(0.4, 1 - (start.y - ball.y) * BALL_SHRINK_PER_Y)),
    keeper: frozen ? keeperStart : interpolate(keeperStart, keeperTarget, (elapsed - diveStart) / (outcome === 'save' ? 500 : 600)),
    diving: !frozen && elapsed >= diveStart,
    diveElapsed: Math.max(0, elapsed - diveStart),
    flipKeeper: keeperTarget.x < keeperStart.x,
    /** The ball sprite's spin faces left by default; flip it for shots heading right. */
    flipBall: side(targets[outcome], mirror).x > start.x,
    progress,
  }
}
