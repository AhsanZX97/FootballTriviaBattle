import type { Question } from '../../types/trivia'
import type { ShootoutState } from '../../types/match'
import type { ServerMessage } from '../../types/multiplayer'
import type { MultiplayerSocket } from '../../services/multiplayer/socket'
import type { MatchReadySession } from '../lobby/store'
import { applyAnswer, createInitialState, isMatchOver } from '../../game/shootout'
import { getQuestions } from '../../services/trivia/questionSource'
import { authStore } from '../auth/store'
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
  rematchVotes: number
  rematchIVoted: boolean
  opponentLeft: boolean
  /** Set when the socket closes unexpectedly (server died / our own network
   * dropped) — distinct from opponentLeft, which the server relays before a
   * clean disconnect. Reconnection is out of scope; this just avoids a freeze. */
  connectionLost: boolean
  /** True between sending my own kick to the server and its kickResolved echo. */
  pendingKick: boolean
  /** Who the most recently resolved kick belonged to — lets the UI skip
   * re-animating a kick it already showed optimistically. */
  lastKickBy: 'you' | 'opponent' | null
}

const initialState: MatchState = {
  mode: 'cpu',
  phase: 'idle',
  questions: [],
  questionIndex: 0,
  shootout: createInitialState(),
  opponentName: null,
  rematchVotes: 0,
  rematchIVoted: false,
  opponentLeft: false,
  connectionLost: false,
  pendingKick: false,
  lastKickBy: null,
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
    try {
      const { data, error } = await supabase.rpc('award_cpu_win')
      if (!error && typeof data === 'number') authStore.applyCoinsUpdate(data)
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

  /** Resolve the current kick. `correct === false` also covers a timeout. CPU mode only. */
  function submitAnswer(correct: boolean) {
    if (state.phase !== 'active' || isMatchOver(state.shootout)) return
    const shootout = applyAnswer(state.shootout, correct)
    // ponytail: index wraps so a long sudden death never runs the pool dry;
    // swap for a no-repeat draw if question reuse becomes noticeable.
    const questionIndex = (state.questionIndex + 1) % state.questions.length
    set({ shootout, questionIndex })
    // isMatchOver guard above means this only ever fires once, on the
    // playing -> won transition.
    if (shootout.status === 'won') void awardCpuWinIfSignedIn()
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
        set({
          shootout: applyAnswer(state.shootout, correct),
          questionIndex: nextQuestionIndex(),
          lastKickBy: message.by,
          pendingKick: message.by === 'you' ? false : state.pendingKick,
        })
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
        })
        return
      case 'opponentLeft':
        set({
          opponentLeft: true,
          shootout: isMatchOver(state.shootout)
            ? state.shootout
            : { ...state.shootout, status: 'won' },
        })
        return
      case 'coinsAwarded':
        authStore.applyCoinsUpdate(message.balance)
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
