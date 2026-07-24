import type { Question } from '../../types/trivia'
import type { ShootoutState } from '../../types/match'
import type { ServerMessage } from '../../types/multiplayer'
import type { MultiplayerSocket } from '../../services/multiplayer/socket'
import type { MatchReadySession } from '../lobby/store'
import { applyAnswer, createInitialState, isMatchOver } from '../../game/shootout'
import { getQuestions } from '../../services/trivia/questionSource'
import { authStore } from '../auth/store'
import { challengesStore } from '../challenges/store'
import { supabase } from '../../services/supabase'

/** Seconds per question. Single source of truth so it can be made user-selectable later. */
export const QUESTION_TIME_SECONDS = 10
/** Questions drawn once at match start from the bundled football bank. */
export const QUESTION_BATCH = 30

export type MatchMode = 'cpu' | '1v1'
export type MatchPhase = 'idle' | 'loading' | 'active' | 'rematchStarting' | 'error'

export interface MatchState {
  mode: MatchMode
  phase: MatchPhase
  questions: Question[]
  questionIndex: number
  shootout: ShootoutState
  error?: string
  // 1v1-only — unused (left at their defaults) in 'cpu' mode.
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
  mode: 'cpu',
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

  /** Best-effort vs-CPU coin award — rate-limited server-side (see
   * award_cpu_win in the Supabase migration), so a failure or a
   * rate-limit response here is silent and never blocks the result screen. */
  async function awardCpuWinIfSignedIn() {
    if (authStore.getState().status !== 'signedIn') return
    const before = authStore.getState().coins
    try {
      const { data, error } = await supabase.rpc('award_cpu_win')
      if (!error && typeof data === 'number') {
        authStore.applyCoinsUpdate(data)
        const gained = data - before
        if (gained > 0) set({ coinsAwarded: gained })
      }
    } catch {
      // best-effort; network/RPC failures never surface to the player
    }
  }

  async function start() {
    set({ ...initialState, phase: 'loading' })
    try {
      const questions = await getQuestions(QUESTION_BATCH)
      if (questions.length === 0) throw new Error('no questions available')
      set({
        phase: 'active',
        questions,
        questionIndex: 0,
        shootout: createInitialState(),
      })
    } catch (e) {
      set({ phase: 'error', error: e instanceof Error ? e.message : 'failed to load questions' })
    }
  }

  /** Best-effort vs-CPU history write — logs every finished CPU game (win or
   * loss) for the stat tab. Unlike the coin award it isn't rate-limited, and a
   * failure here is silent so it never blocks the result screen. */
  async function recordCpuResult(outcome: 'win' | 'loss', userScore: number, cpuScore: number) {
    if (authStore.getState().status !== 'signedIn') return
    try {
      await supabase.rpc('record_cpu_match', {
        p_outcome: outcome,
        p_user_score: userScore,
        p_opponent_score: cpuScore,
      })
    } catch {
      // best-effort; network/RPC failures never surface to the player
    }
  }

  /** Resolve the current kick. `correct === false` also covers a timeout. CPU mode only. */
  function submitAnswer(correct: boolean) {
    if (state.phase !== 'active' || isMatchOver(state.shootout)) return
    // Capture the stage before it flips: a correct answer on 'shoot' is a scored
    // penalty (for the daily challenge), on 'keep' it's a save.
    const wasShoot = state.shootout.stage === 'shoot'
    const shootout = applyAnswer(state.shootout, correct)
    // ponytail: index wraps so a long sudden death never runs the pool dry;
    // swap for a no-repeat draw if question reuse becomes noticeable.
    const questionIndex = (state.questionIndex + 1) % state.questions.length
    set({ shootout, questionIndex })
    challengesStore.recordAnswer(correct, wasShoot)
    // isMatchOver guard above means this only ever fires once, on the
    // playing -> won/lost transition.
    if (isMatchOver(shootout)) {
      if (shootout.status === 'won') {
        void awardCpuWinIfSignedIn()
        challengesStore.recordCpuWin()
      }
      void recordCpuResult(
        shootout.status === 'won' ? 'win' : 'loss',
        shootout.userScore,
        shootout.cpuScore,
      )
    }
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
          pendingKick: message.by === 'you' ? false : state.pendingKick,
        })
        // Only my own kicks count as answered questions / scored penalties.
        if (message.by === 'you') challengesStore.recordAnswer(correct, wasShoot)
        // A kick that ends the match in my favour is a 1v1 win.
        if (wasPlaying && shootout.status === 'won') challengesStore.record1v1Win()
        return
      }
      case 'rematchVotes':
        set({ rematchVotes: message.count })
        return
      case 'rematchStart':
        set({
          phase: 'rematchStarting',
          questions: message.questions,
          questionIndex: 0,
          shootout: { ...createInitialState(), stage: message.youGoFirst ? 'shoot' : 'keep' },
          rematchVotes: 0,
          rematchIVoted: false,
          lastKickBy: null,
          coinsAwarded: null,
        })
        return
      case 'opponentLeft': {
        // Leaving mid-match forfeits it to me (mirrors the server's forfeit);
        // leaving after the final kick changes nothing about the result.
        const abandoned = !isMatchOver(state.shootout)
        set({
          opponentLeft: true,
          matchAbandoned: abandoned,
          shootout: abandoned ? { ...state.shootout, status: 'won' } : state.shootout,
        })
        // A mid-match forfeit is a win in my favour — counts for the daily challenge.
        if (abandoned) challengesStore.record1v1Win()
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
      mode: '1v1',
      phase: 'active',
      questions: session.questions,
      opponentName: session.opponentName,
      opponentGkSkin: session.opponentGkSkin,
      shootout: { ...createInitialState(), stage: session.youGoFirst ? 'shoot' : 'keep' },
    })
  }

  /** Sends my kick's outcome to the server; the shootout only advances once it echoes back. */
  function submitAnswer1v1(scored: boolean) {
    if (!socket || state.phase !== 'active') return
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
    start,
    submitAnswer,
    start1v1,
    submitAnswer1v1,
    voteRematch1v1,
    finishRematchStart,
    leaveMatch1v1,
    reset,
  }
}

export const matchStore = createMatchStore()
