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

type Point = { x: number; y: number }
const ballStart = { x: 0.5, y: 0.8 }
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

export function shotPose(
  outcome: SceneFeedback,
  elapsed: number,
  reaction: KeeperReaction = 'wrong-way',
  mirror = false,
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
  return {
    ball: interpolate(ballStart, side(targets[outcome], mirror), progress),
    keeper: frozen ? keeperStart : interpolate(keeperStart, keeperTarget, (elapsed - diveStart) / (outcome === 'save' ? 500 : 600)),
    diving: !frozen && elapsed >= diveStart,
    diveElapsed: Math.max(0, elapsed - diveStart),
    flipKeeper: keeperTarget.x < keeperStart.x,
    /** The ball sprite's spin faces left by default; flip it for shots heading right. */
    flipBall: side(targets[outcome], mirror).x > ballStart.x,
    progress,
  }
}
