import type { Question } from '../../types/trivia'
import type { ShootoutState } from '../../types/match'
import type { ServerMessage } from '../../types/multiplayer'
import type { MultiplayerSocket } from '../../services/multiplayer/socket'
import type { MatchReadySession } from '../lobby/store'
import { applyAnswer, createInitialState, isMatchOver } from '../../game/shootout'
import { questionsFromMatchPayload } from '../../services/trivia/bank/localised'
import { i18nStore } from '../../services/i18n/store'
import { authStore } from '../auth/store'
import { challengesStore } from '../challenges/store'
import { localProgressStore } from '../progress/store'
import { awardForLocalResult } from '../../game/awards'
import { analytics } from '../../services/analytics'

/** Seconds per question. Single source of truth so it can be made user-selectable later. */
export const QUESTION_TIME_SECONDS = 10

export type MatchPhase = 'idle' | 'active' | 'rematchStarting'

export interface MatchState {
  phase: MatchPhase
  questions: Question[]
  questionIndex: number
  shootout: ShootoutState
  opponentName: string | null
  /** Opponent's equipped keeper skin id; null = stock keeper (anonymous
   * opponent, or one with nothing equipped). */
  opponentGkSkin: string | null
  rematchVotes: number
  rematchIVoted: boolean
  opponentLeft: boolean
  /** True when the opponent left while the match was still being played — the
   * "result" is a forfeit in my favour, shown as an abandonment rather than a
   * win/loss earned on the pitch. Stays false if they left after full time. */
  matchAbandoned: boolean
  /** Set when the socket closes unexpectedly (server died / our own network
   * dropped) — distinct from opponentLeft, which the server relays before a
   * clean disconnect. Reconnection is out of scope; this just avoids a freeze. */
  connectionLost: boolean
  /** True between sending my own kick to the server and its kickResolved echo. */
  pendingKick: boolean
  /** Who the most recently resolved kick belonged to — lets the UI skip
   * re-animating a kick it already showed optimistically. */
  lastKickBy: 'you' | 'opponent' | null
  /** Coins gained from this match's result (the balance *delta*, not the new
   * total), used to show the "+N" reward on the result screen. Null until an
   * award lands; a rate-limited/zero award stays null so nothing is shown. */
  coinsAwarded: number | null
}

const initialState: MatchState = {
  phase: 'idle',
  questions: [],
  questionIndex: 0,
  shootout: createInitialState(),
  opponentName: null,
  opponentGkSkin: null,
  rematchVotes: 0,
  rematchIVoted: false,
  opponentLeft: false,
  matchAbandoned: false,
  connectionLost: false,
  pendingKick: false,
  lastKickBy: null,
  coinsAwarded: null,
}

type Listener = () => void

function createMatchStore() {
  let state = initialState
  let socket: MultiplayerSocket | null = null
  // Distinguishes our own deliberate socket.close() (leave / reset) from an
  // unexpected drop, so onClose only surfaces connectionLost for the latter.
  let closingIntentionally = false
  const listeners = new Set<Listener>()

  const getState = () => state
  const subscribe = (l: Listener): (() => void) => {
    listeners.add(l)
    return () => void listeners.delete(l)
  }
  const set = (patch: Partial<MatchState>) => {
    state = { ...state, ...patch }
    listeners.forEach((l) => l())
  }

  const getCurrentQuestion = (): Question | undefined =>
    state.questions[state.questionIndex]

  /**
   * Bank a finished match on-device when nobody is signed in.
   *
   * Signed in against the real server, the server is the authority: it writes
   * the history row and pushes `coinsAwarded`, and this does nothing. Signed
   * out, that path pays nothing at all (no userId to credit) and the offline
   * bot fallback never sends `coinsAwarded` either — so the same result would
   * silently be worth zero. This is what makes a pre-account match count.
   *
   * The amount comes from the shared `awardForLocalResult`, so the coins a
   * player banks here are exactly what the server would have paid them; the
   * balance doesn't shift when they later sign in.
   */
  function recordLocalResult(shootout: ShootoutState, byForfeit: boolean): void {
    if (authStore.getState().status === 'signedIn') return

    const won = shootout.status === 'won'
    localProgressStore.recordMatch({
      outcome: won ? 'win' : 'loss',
      userScore: shootout.userScore,
      opponentScore: shootout.cpuScore,
      opponentName: state.opponentName ?? 'Player',
      byDisconnect: byForfeit,
      createdAt: localProgressStore.timestamp(),
    })

    const amount = awardForLocalResult({
      won,
      byForfeit,
      kicksTaken: shootout.kicks.length,
      myScore: shootout.userScore,
      opponentScore: shootout.cpuScore,
    })
    if (amount <= 0) return
    localProgressStore.addCoins(amount)
    // Same field the server's `coinsAwarded` sets, so the result screen shows
    // the reward identically whether it was earned locally or paid out.
    set({ coinsAwarded: amount })
  }

  function nextQuestionIndex() {
    return state.questions.length === 0 ? 0 : (state.questionIndex + 1) % state.questions.length
  }

  function handleSocketMessage(message: ServerMessage) {
    switch (message.type) {
      case 'kickResolved': {
        // Mirrors the server's own stage/side mapping: 'shoot' is always my
        // kick locally, so a 'you' result feeds the engine directly and an
        // 'opponent' result flips through the same "keep"-stage inversion
        // the server uses (see server/room.ts's toEngineCorrect).
        const correct = message.by === 'you' ? message.scored : !message.scored
        const wasShoot = state.shootout.stage === 'shoot'
        const wasPlaying = state.shootout.status === 'playing'
        const shootout = applyAnswer(state.shootout, correct)
        set({
          shootout,
          questionIndex: nextQuestionIndex(),
          lastKickBy: message.by,
          // Any resolved kick means nothing of mine is in flight any more.
          // Clearing only on `by: 'you'` left the flag set whenever the server
          // dropped my kick, which hid the question on my *next* turn.
          pendingKick: false,
        })
        // Only my own kicks count as answered questions / scored penalties.
        if (message.by === 'you') challengesStore.recordAnswer(correct, wasShoot)
        // A kick that ends the match in my favour is a 1v1 win.
        if (wasPlaying && shootout.status === 'won') challengesStore.record1v1Win()
        if (wasPlaying && isMatchOver(shootout)) {
          recordLocalResult(shootout, false)
          analytics.track('match_end', {
            mode: '1v1',
            outcome: shootout.status === 'won' ? 'win' : 'loss',
            userScore: shootout.userScore,
            opponentScore: shootout.cpuScore,
          })
        }
        return
      }
      case 'rematchVotes':
        set({ rematchVotes: message.count })
        return
      case 'rematchStart':
        set({
          phase: 'rematchStarting',
          questions: questionsFromMatchPayload(message, i18nStore.getLocale()),
          questionIndex: 0,
          shootout: { ...createInitialState(), stage: message.youGoFirst ? 'shoot' : 'keep' },
          rematchVotes: 0,
          rematchIVoted: false,
          lastKickBy: null,
          coinsAwarded: null,
        })
        analytics.track('match_start', { mode: '1v1' })
        return
      case 'opponentLeft': {
        // Leaving mid-match forfeits it to me (mirrors the server's forfeit);
        // leaving after the final kick changes nothing about the result.
        const abandoned = !isMatchOver(state.shootout)
        const forfeited: ShootoutState = { ...state.shootout, status: 'won' }
        set({
          opponentLeft: true,
          matchAbandoned: abandoned,
          shootout: abandoned ? forfeited : state.shootout,
        })
        // A mid-match forfeit is a win in my favour — counts for the daily challenge.
        if (abandoned) {
          challengesStore.record1v1Win()
          recordLocalResult(forfeited, true)
        }
        return
      }
      case 'coinsAwarded':
        authStore.applyCoinsUpdate(message.balance)
        if (message.amount > 0) set({ coinsAwarded: message.amount })
        return
      default:
        return
    }
  }

  /** Wires the socket handed off by the lobby once its countdown finishes. */
  function start1v1(session: MatchReadySession) {
    socket = session.socket
    closingIntentionally = false
    socket.onMessage(handleSocketMessage)
    socket.onClose(() => {
      // A clean opponent disconnect arrives as an 'opponentLeft' message first;
      // reaching here without that means the server or our own link dropped.
      if (closingIntentionally || state.opponentLeft) return
      set({ connectionLost: true })
    })
    set({
      ...initialState,
      phase: 'active',
      questions: session.questions,
      opponentName: session.opponentName,
      opponentGkSkin: session.opponentGkSkin,
      shootout: { ...createInitialState(), stage: session.youGoFirst ? 'shoot' : 'keep' },
    })
    analytics.track('match_start', { mode: '1v1' })
  }

  /**
   * Sends my kick's outcome to the server; the shootout only advances once it
   * echoes back.
   *
   * The server's kick clock starts the moment it sends `kickResolved`, while
   * ours only gets here after the opponent's replay animation, the question
   * timer and my own animation. A slow device can overrun that deadline, in
   * which case the server has already timed the kick out and moved on — it
   * answers a kick for a stage it isn't on with silence, so sending one would
   * set `pendingKick` with nothing left to clear it. Bail instead: the kick is
   * already lost, and the next question stays reachable.
   */
  function submitAnswer1v1(scored: boolean) {
    if (!socket || state.phase !== 'active') return
    if (state.pendingKick || isMatchOver(state.shootout)) return
    if (state.shootout.stage !== 'shoot') return
    socket.send({ type: 'kickResult', scored })
    set({ pendingKick: true })
  }

  function voteRematch1v1() {
    if (!socket || state.rematchIVoted) return
    socket.send({ type: 'rematchVote' })
    set({ rematchIVoted: true, rematchVotes: Math.max(state.rematchVotes, 1) })
  }

  /** Called once the rematch's who-goes-first/3-2-1 sequence finishes playing. */
  function finishRematchStart() {
    set({ phase: 'active' })
  }

  function leaveMatch1v1() {
    // Walking out before full time is the drop-off signal; leaving from the
    // result screen is just normal exit, so only the former is tracked.
    if (state.phase === 'active' && !isMatchOver(state.shootout)) {
      analytics.track('match_quit', { mode: '1v1', questionIndex: state.questionIndex })
    }
    closingIntentionally = true
    socket?.send({ type: 'leave' })
    socket?.close()
    socket = null
    set(initialState)
  }

  function reset() {
    closingIntentionally = true
    socket?.close()
    socket = null
    set(initialState)
  }

  return {
    getState,
    subscribe,
    getCurrentQuestion,
    start1v1,
    submitAnswer1v1,
    voteRematch1v1,
    finishRematchStart,
    leaveMatch1v1,
    reset,
  }
}

export const matchStore = createMatchStore()
