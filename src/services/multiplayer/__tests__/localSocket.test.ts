import { describe, expect, it, vi } from 'vitest'
import type { ServerMessage } from '../../../types/multiplayer'
import type { Question } from '../../../types/trivia'
import { createLocalMatch, LOCAL_QUESTION_BATCH, OPENING_KICK_DELAY_MS } from '../localSocket'

const sample: Question[] = Array.from({ length: 4 }, (_, i) => ({
  id: `q${i}`,
  prompt: `Q${i}?`,
  correctAnswer: 'A',
  answers: ['A', 'B', 'C', 'D'],
  difficulty: 'easy',
  category: 'Sports',
}))

/** A clock the test drives by hand, so nothing depends on real timers. */
function fakeClock() {
  let now = 0
  let nextId = 1
  const scheduled = new Map<number, { at: number; fn: () => void }>()
  return {
    setTimer: (fn: () => void, ms: number) => {
      const id = nextId++
      scheduled.set(id, { at: now + ms, fn })
      return id as unknown as ReturnType<typeof setTimeout>
    },
    clearTimer: (handle: ReturnType<typeof setTimeout>) =>
      void scheduled.delete(handle as unknown as number),
    /** Run every timer due within `ms`, in order, advancing the clock. */
    advance(ms: number) {
      const target = now + ms
      for (;;) {
        const due = [...scheduled.entries()]
          .filter(([, t]) => t.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0]
        if (!due) break
        scheduled.delete(due[0])
        now = due[1].at
        due[1].fn()
      }
      now = target
    },
    pendingCount: () => scheduled.size,
  }
}

/** rng stub: `rolls` are consumed in order, then it settles on `fallback`. */
function rng(rolls: number[], fallback = 0.5) {
  let i = 0
  return () => (i < rolls.length ? rolls[i++]! : fallback)
}

async function localMatch(
  opts: { rolls?: number[]; fallback?: number; questions?: Question[] } = {},
) {
  const clock = fakeClock()
  const loadQuestions = vi.fn(async () => opts.questions ?? sample)
  const match = await createLocalMatch({
    rng: rng(opts.rolls ?? [], opts.fallback),
    loadQuestions,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  })
  const seen: ServerMessage[] = []
  match.socket.onMessage((m) => void seen.push(m))
  return { ...match, clock, seen, loadQuestions }
}

// createBotProfile burns two rolls here — skill, then the gk-skin chance
// (0.9 misses the 0.35 gate, so it never rolls a skin id). The third roll is
// the youGoFirst flip: below 0.5 puts the player first.
const YOU_FIRST = [0.5, 0.9, 0.1]
const BOT_FIRST = [0.5, 0.9, 0.9]

describe('createLocalMatch', () => {
  it('draws a full question batch and names an opponent', async () => {
    const match = await localMatch({ rolls: YOU_FIRST })
    expect(match.loadQuestions).toHaveBeenCalledWith(LOCAL_QUESTION_BATCH)
    expect(match.questions).toEqual(sample)
    expect(match.opponent.name).toBeTruthy()
  })

  it('resolves my kick immediately and reports it as mine', async () => {
    const match = await localMatch({ rolls: YOU_FIRST })
    expect(match.youGoFirst).toBe(true)
    match.socket.send({ type: 'kickResult', scored: true })
    expect(match.seen).toEqual([{ type: 'kickResolved', by: 'you', scored: true }])
  })

  it("takes the bot's kick after a delay, reported as the opponent's", async () => {
    const match = await localMatch({ rolls: YOU_FIRST, fallback: 0.1 }) // skill 0.5 vs roll 0.1 = scores
    match.socket.send({ type: 'kickResult', scored: true })
    match.seen.length = 0
    expect(match.seen).toHaveLength(0) // the bot doesn't answer instantly
    match.clock.advance(10_000)
    expect(match.seen).toEqual([{ type: 'kickResolved', by: 'opponent', scored: true }])
  })

  it('holds the opening kick until the pre-match countdown could have finished', async () => {
    const match = await localMatch({ rolls: BOT_FIRST })
    expect(match.youGoFirst).toBe(false)
    match.clock.advance(OPENING_KICK_DELAY_MS - 100)
    expect(match.seen).toHaveLength(0)
    match.clock.advance(10_000)
    expect(match.seen).toEqual([{ type: 'kickResolved', by: 'opponent', scored: expect.any(Boolean) }])
  })

  it('ignores a kick that is not mine to take', async () => {
    const match = await localMatch({ rolls: BOT_FIRST })
    match.socket.send({ type: 'kickResult', scored: true })
    expect(match.seen).toHaveLength(0)
  })

  it('plays a full match through to a result without stalling', async () => {
    // fallback 0.9 vs skill 0.5: the bot misses every kick, so I win 5-0.
    const match = await localMatch({ rolls: YOU_FIRST, fallback: 0.9 })
    for (let i = 0; i < 5; i++) {
      match.socket.send({ type: 'kickResult', scored: true })
      match.clock.advance(10_000)
    }
    const mine = match.seen.filter((m) => m.type === 'kickResolved' && m.by === 'you')
    const theirs = match.seen.filter((m) => m.type === 'kickResolved' && m.by === 'opponent')
    expect(mine).toHaveLength(5)
    expect(theirs).toHaveLength(5)
    // match over: nothing left ticking
    expect(match.clock.pendingCount()).toBe(0)
  })

  it('acknowledges a rematch vote and the bot always accepts', async () => {
    const match = await localMatch({ rolls: YOU_FIRST, fallback: 0.9 })
    for (let i = 0; i < 5; i++) {
      match.socket.send({ type: 'kickResult', scored: true })
      match.clock.advance(10_000)
    }
    match.seen.length = 0
    match.socket.send({ type: 'rematchVote' })
    expect(match.seen).toEqual([{ type: 'rematchVotes', count: 1 }])
    match.clock.advance(10_000)
    await Promise.resolve() // startRematch awaits its question draw
    expect(match.seen.some((m) => m.type === 'rematchStart')).toBe(true)
  })

  it('stops ticking once the socket is closed', async () => {
    const match = await localMatch({ rolls: YOU_FIRST })
    match.socket.send({ type: 'kickResult', scored: true })
    match.socket.close()
    match.seen.length = 0
    match.clock.advance(10_000)
    expect(match.seen).toHaveLength(0)
  })

  it('notifies close handlers, including one attached after closing', async () => {
    const match = await localMatch({ rolls: YOU_FIRST })
    const early = vi.fn()
    match.socket.onClose(early)
    match.socket.close()
    expect(early).toHaveBeenCalled()
    const late = vi.fn()
    match.socket.onClose(late)
    expect(late).toHaveBeenCalled()
  })

  it('stops the bot when I leave', async () => {
    const match = await localMatch({ rolls: YOU_FIRST })
    match.socket.send({ type: 'kickResult', scored: true })
    match.socket.send({ type: 'leave' })
    match.seen.length = 0
    match.clock.advance(10_000)
    expect(match.seen).toHaveLength(0)
  })

  it('never awards coins — that is the server\'s to give', async () => {
    const match = await localMatch({ rolls: YOU_FIRST, fallback: 0.9 })
    for (let i = 0; i < 5; i++) {
      match.socket.send({ type: 'kickResult', scored: true })
      match.clock.advance(10_000)
    }
    expect(match.seen.some((m) => m.type === 'coinsAwarded')).toBe(false)
  })
})
