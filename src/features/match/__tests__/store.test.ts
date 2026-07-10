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

const getQuestions = vi.fn<(count: number) => Promise<Question[]>>()
vi.mock('../../../services/trivia/questionSource', () => ({
  getQuestions: (count: number) => getQuestions(count),
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

const rpc = vi.fn<(fn: string) => Promise<{ data: unknown; error: { message: string } | null }>>()
vi.mock('../../../services/supabase', () => ({
  supabase: { rpc: (fn: string) => rpc(fn) },
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
      youGoFirst: true,
      questions: sample,
      ...overrides,
    },
    fake,
  }
}

beforeEach(() => {
  matchStore.reset()
  getQuestions.mockReset()
  getQuestions.mockResolvedValue(sample)
  authState.status = 'signedOut'
  authState.coins = 0
  applyCoinsUpdate.mockReset()
  rpc.mockReset()
  rpc.mockResolvedValue({ data: null, error: null })
})

describe('matchStore', () => {
  it('starts idle with a fresh shootout', () => {
    const s = matchStore.getState()
    expect(s.phase).toBe('idle')
    expect(s.shootout.status).toBe('playing')
  })

  it('loads a question batch and becomes active', async () => {
    await matchStore.start()
    expect(matchStore.getState().phase).toBe('active')
    expect(matchStore.getCurrentQuestion()).toEqual(sample[0])
  })

  it('advances the question and resolves the kick on an answer', async () => {
    await matchStore.start()
    matchStore.submitAnswer(true) // user shoots and scores
    const s = matchStore.getState()
    expect(s.shootout.userScore).toBe(1)
    expect(s.questionIndex).toBe(1)
    expect(matchStore.getCurrentQuestion()).toEqual(sample[1])
  })

  it('notifies subscribers on state change', async () => {
    const spy = vi.fn()
    const unsub = matchStore.subscribe(spy)
    await matchStore.start()
    expect(spy).toHaveBeenCalled()
    unsub()
  })

  it('ignores answers once the match is over', async () => {
    await matchStore.start()
    for (let i = 0; i < 10; i++) matchStore.submitAnswer(true) // win 5-0
    expect(matchStore.getState().shootout.status).toBe('won')
    const before = matchStore.getState().shootout
    matchStore.submitAnswer(false)
    expect(matchStore.getState().shootout).toBe(before)
  })

  it('goes to error phase when no questions come back', async () => {
    getQuestions.mockResolvedValue([])
    await matchStore.start()
    expect(matchStore.getState().phase).toBe('error')
  })

  it('awards a CPU-win coin via RPC when signed in and the match is won', async () => {
    authState.status = 'signedIn'
    rpc.mockResolvedValue({ data: 7, error: null })
    await matchStore.start()
    for (let i = 0; i < 10; i++) matchStore.submitAnswer(true) // win 5-0

    await vi.waitFor(() => expect(applyCoinsUpdate).toHaveBeenCalledWith(7))
    expect(rpc).toHaveBeenCalledWith('award_cpu_win')
  })

  it('records the CPU-win gain (new balance minus old) as coinsAwarded', async () => {
    authState.status = 'signedIn'
    authState.coins = 4
    rpc.mockResolvedValue({ data: 7, error: null })
    await matchStore.start()
    for (let i = 0; i < 10; i++) matchStore.submitAnswer(true) // win 5-0

    await vi.waitFor(() => expect(matchStore.getState().coinsAwarded).toBe(3))
  })

  it('leaves coinsAwarded null when a rate-limited CPU award returns the same balance', async () => {
    authState.status = 'signedIn'
    authState.coins = 7
    rpc.mockResolvedValue({ data: 7, error: null }) // unchanged: rate-limited
    await matchStore.start()
    for (let i = 0; i < 10; i++) matchStore.submitAnswer(true)

    await vi.waitFor(() => expect(applyCoinsUpdate).toHaveBeenCalledWith(7))
    expect(matchStore.getState().coinsAwarded).toBeNull()
  })

  it('does not attempt a CPU-win award when signed out', async () => {
    authState.status = 'signedOut'
    await matchStore.start()
    for (let i = 0; i < 10; i++) matchStore.submitAnswer(true) // win 5-0

    await Promise.resolve()
    expect(rpc).not.toHaveBeenCalled()
    expect(applyCoinsUpdate).not.toHaveBeenCalled()
  })

  it('does not award a coin on a CPU loss', async () => {
    authState.status = 'signedIn'
    await matchStore.start()
    for (let i = 0; i < 10; i++) matchStore.submitAnswer(false) // lose 0-5

    await Promise.resolve()
    expect(matchStore.getState().shootout.status).toBe('lost')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('silently ignores a rate-limited (null balance) CPU award response', async () => {
    authState.status = 'signedIn'
    rpc.mockResolvedValue({ data: null, error: null })
    await matchStore.start()
    for (let i = 0; i < 10; i++) matchStore.submitAnswer(true)

    await vi.waitFor(() => expect(rpc).toHaveBeenCalled())
    expect(applyCoinsUpdate).not.toHaveBeenCalled()
  })
})

describe('matchStore 1v1 mode', () => {
  it('starts on the shoot stage when youGoFirst is true', () => {
    const { session } = readySession({ youGoFirst: true })
    matchStore.start1v1(session)
    const s = matchStore.getState()
    expect(s.mode).toBe('1v1')
    expect(s.phase).toBe('active')
    expect(s.opponentName).toBe('Bob')
    expect(s.shootout.stage).toBe('shoot')
  })

  it('starts on the keep stage when youGoFirst is false (opponent kicks first)', () => {
    const { session } = readySession({ youGoFirst: false })
    matchStore.start1v1(session)
    expect(matchStore.getState().shootout.stage).toBe('keep')
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

  it('forces a win and flags opponentLeft when the opponent disconnects mid-match', () => {
    const { session, fake } = readySession()
    matchStore.start1v1(session)

    fake.emit({ type: 'opponentLeft' })

    const s = matchStore.getState()
    expect(s.opponentLeft).toBe(true)
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
  })

  it('sends leave and resets to idle cpu-mode defaults', () => {
    const { session, fake } = readySession()
    matchStore.start1v1(session)
    matchStore.leaveMatch1v1()
    expect(fake.sent).toContainEqual({ type: 'leave' })
    expect(fake.isClosed()).toBe(true)
    expect(matchStore.getState()).toMatchObject({ mode: 'cpu', phase: 'idle' })
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
