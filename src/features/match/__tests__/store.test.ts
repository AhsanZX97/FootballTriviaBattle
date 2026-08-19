import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Question } from '../../../types/trivia'
import type { ClientMessage, ServerMessage } from '../../../types/multiplayer'
import type { MultiplayerSocket } from '../../../services/multiplayer/socket'
import type { MatchReadySession } from '../../lobby/store'

const sample: Question[] = Array.from({ length: 4 }, (_, i) => ({
  id: `q${i}`,
  prompt: `Q${i}?`,
  correctAnswer: 'A',
  answers: ['A', 'B', 'C', 'D'],
  difficulty: 'easy',
  category: 'Sports',
}))

const authState: { status: 'signedOut' | 'loading' | 'signedIn'; coins: number } = {
  status: 'signedOut',
  coins: 0,
}
const applyCoinsUpdate = vi.fn()
vi.mock('../../auth/store', () => ({
  authStore: {
    getState: () => authState,
    applyCoinsUpdate: (balance: number) => applyCoinsUpdate(balance),
  },
}))

import { matchStore } from '../store'

function createFakeSocket() {
  const messageHandlers: Array<(m: ServerMessage) => void> = []
  const closeHandlers: Array<() => void> = []
  const sent: ClientMessage[] = []
  let closed = false
  const socket: MultiplayerSocket = {
    send: (m) => void sent.push(m),
    onMessage: (h) => {
      messageHandlers.push(h)
      return () => void messageHandlers.splice(messageHandlers.indexOf(h), 1)
    },
    onClose: (h) => {
      closeHandlers.push(h)
      return () => void closeHandlers.splice(closeHandlers.indexOf(h), 1)
    },
    close: () => void (closed = true),
  }
  return {
    socket,
    sent,
    isClosed: () => closed,
    emit: (m: ServerMessage) => messageHandlers.forEach((h) => h(m)),
    emitClose: () => closeHandlers.forEach((h) => h()),
  }
}

function readySession(overrides: Partial<MatchReadySession> = {}, fake = createFakeSocket()): {
  session: MatchReadySession
  fake: ReturnType<typeof createFakeSocket>
} {
  return {
    session: {
      socket: fake.socket,
      opponentName: 'Bob',
      opponentGkSkin: null,
      youGoFirst: true,
      questions: sample,
      ...overrides,
    },
    fake,
  }
}

beforeEach(() => {
  matchStore.reset()
  authState.status = 'signedOut'
  authState.coins = 0
  applyCoinsUpdate.mockReset()
})

describe('matchStore', () => {
  it('starts idle with a fresh shootout', () => {
    const s = matchStore.getState()
    expect(s.phase).toBe('idle')
    expect(s.shootout.status).toBe('playing')
  })

  it('notifies subscribers on state change', () => {
    const spy = vi.fn()
    const unsub = matchStore.subscribe(spy)
    const { session } = readySession()
    matchStore.start1v1(session)
    expect(spy).toHaveBeenCalled()
    unsub()
  })

  it('serves the current question and advances with the match', () => {
    const { session, fake } = readySession()
    matchStore.start1v1(session)
    expect(matchStore.getCurrentQuestion()).toEqual(sample[0])
    fake.emit({ type: 'kickResolved', by: 'you', scored: true })
    expect(matchStore.getState().questionIndex).toBe(1)
    expect(matchStore.getCurrentQuestion()).toEqual(sample[1])
  })
})

describe('matchStore 1v1 session', () => {
  it('starts on the shoot stage when youGoFirst is true', () => {
    const { session } = readySession({ youGoFirst: true })
    matchStore.start1v1(session)
    const s = matchStore.getState()
    expect(s.phase).toBe('active')
    expect(s.opponentName).toBe('Bob')
    expect(s.shootout.stage).toBe('shoot')
  })

  it('starts on the keep stage when youGoFirst is false (opponent kicks first)', () => {
    const { session } = readySession({ youGoFirst: false })
    matchStore.start1v1(session)
    expect(matchStore.getState().shootout.stage).toBe('keep')
  })

  it("keeps the opponent's keeper skin from the session", () => {
    const { session } = readySession({ opponentGkSkin: 'gk_coral_guard' })
    matchStore.start1v1(session)
    expect(matchStore.getState().opponentGkSkin).toBe('gk_coral_guard')
  })

  it('marks a kick pending on submitAnswer1v1 without touching the shootout yet', () => {
    const { session, fake } = readySession()
    matchStore.start1v1(session)
    matchStore.submitAnswer1v1(true)
    expect(fake.sent).toEqual([{ type: 'kickResult', scored: true }])
    expect(matchStore.getState().pendingKick).toBe(true)
    expect(matchStore.getState().shootout.userScore).toBe(0)
  })

  it('applies a server coinsAwarded message to the auth store', () => {
    const { session, fake } = readySession()
    matchStore.start1v1(session)

    fake.emit({ type: 'coinsAwarded', amount: 3, balance: 13 })

    expect(applyCoinsUpdate).toHaveBeenCalledWith(13)
    expect(matchStore.getState().coinsAwarded).toBe(3)
  })

  it('clears coinsAwarded when a rematch starts', () => {
    const { session, fake } = readySession()
    matchStore.start1v1(session)
    fake.emit({ type: 'coinsAwarded', amount: 3, balance: 13 })
    expect(matchStore.getState().coinsAwarded).toBe(3)

    fake.emit({ type: 'rematchStart', youGoFirst: false, questions: sample })

    expect(matchStore.getState().coinsAwarded).toBeNull()
  })

  it('applies my own kickResolved, clears pendingKick, and advances the question', () => {
    const { session, fake } = readySession()
    matchStore.start1v1(session)
    matchStore.submitAnswer1v1(true)

    fake.emit({ type: 'kickResolved', by: 'you', scored: true })

    const s = matchStore.getState()
    expect(s.shootout.userScore).toBe(1)
    expect(s.shootout.stage).toBe('keep')
    expect(s.pendingKick).toBe(false)
    expect(s.lastKickBy).toBe('you')
    expect(s.questionIndex).toBe(1)
  })

  it("applies the opponent's kickResolved through the flipped stage mapping", () => {
    const { session, fake } = readySession({ youGoFirst: false }) // start on 'keep'
    matchStore.start1v1(session)

    fake.emit({ type: 'kickResolved', by: 'opponent', scored: true })

    const s = matchStore.getState()
    expect(s.shootout.cpuScore).toBe(1) // opponent scoring shows up as "cpu" scoring locally
    expect(s.shootout.stage).toBe('shoot')
    expect(s.lastKickBy).toBe('opponent')
  })

  it('tracks rematch vote counts from the server', () => {
    const { session, fake } = readySession()
    matchStore.start1v1(session)
    fake.emit({ type: 'rematchVotes', count: 1 })
    expect(matchStore.getState().rematchVotes).toBe(1)
  })

  it('optimistically marks my own rematch vote and ignores a second click', () => {
    const { session, fake } = readySession()
    matchStore.start1v1(session)
    matchStore.voteRematch1v1()
    matchStore.voteRematch1v1()
    expect(fake.sent.filter((m) => m.type === 'rematchVote')).toHaveLength(1)
    expect(matchStore.getState()).toMatchObject({ rematchIVoted: true, rematchVotes: 1 })
  })

  it('resets for a rematch and waits on rematchStarting before resuming', () => {
    const { session, fake } = readySession()
    matchStore.start1v1(session)
    for (let i = 0; i < 10; i++) fake.emit({ type: 'kickResolved', by: 'you', scored: true })
    matchStore.voteRematch1v1()

    fake.emit({ type: 'rematchStart', youGoFirst: false, questions: sample })

    const s = matchStore.getState()
    expect(s.phase).toBe('rematchStarting')
    expect(s.shootout.stage).toBe('keep')
    expect(s.shootout.userScore).toBe(0)
    expect(s.rematchVotes).toBe(0)
    expect(s.rematchIVoted).toBe(false)

    matchStore.finishRematchStart()
    expect(matchStore.getState().phase).toBe('active')
  })

  it('marks the match abandoned (forfeit win) when the opponent disconnects mid-match', () => {
    const { session, fake } = readySession()
    matchStore.start1v1(session)

    fake.emit({ type: 'opponentLeft' })

    const s = matchStore.getState()
    expect(s.opponentLeft).toBe(true)
    expect(s.matchAbandoned).toBe(true)
    expect(s.shootout.status).toBe('won')
  })

  it('flags opponentLeft without disturbing an already-finished match', () => {
    const { session, fake } = readySession()
    matchStore.start1v1(session)
    for (let i = 0; i < 10; i++) fake.emit({ type: 'kickResolved', by: 'you', scored: true })
    const before = matchStore.getState().shootout

    fake.emit({ type: 'opponentLeft' })

    expect(matchStore.getState().shootout).toBe(before)
    expect(matchStore.getState().opponentLeft).toBe(true)
    // the result stood on its own — leaving afterwards doesn't make it an abandonment
    expect(matchStore.getState().matchAbandoned).toBe(false)
  })

  it('sends leave and resets to idle defaults', () => {
    const { session, fake } = readySession()
    matchStore.start1v1(session)
    matchStore.leaveMatch1v1()
    expect(fake.sent).toContainEqual({ type: 'leave' })
    expect(fake.isClosed()).toBe(true)
    expect(matchStore.getState()).toMatchObject({ phase: 'idle' })
  })

  it('surfaces connectionLost when the socket drops unexpectedly', () => {
    const { session, fake } = readySession()
    matchStore.start1v1(session)

    fake.emitClose()

    expect(matchStore.getState().connectionLost).toBe(true)
  })

  it('does not surface connectionLost on our own intentional leave', () => {
    const { session, fake } = readySession()
    matchStore.start1v1(session)
    matchStore.leaveMatch1v1()

    // an intentional close still fires the socket's close handler
    fake.emitClose()

    expect(matchStore.getState().connectionLost).toBe(false)
  })

  it('does not surface connectionLost after a clean opponentLeft', () => {
    const { session, fake } = readySession()
    matchStore.start1v1(session)
    fake.emit({ type: 'opponentLeft' })

    fake.emitClose()

    expect(matchStore.getState().connectionLost).toBe(false)
    expect(matchStore.getState().opponentLeft).toBe(true)
  })
})
