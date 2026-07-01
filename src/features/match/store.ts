import type { Question } from '../../types/trivia'
import type { ShootoutState } from '../../types/match'
import { applyAnswer, createInitialState, isMatchOver } from '../../game/shootout'
import { getQuestions } from '../../services/trivia/questionSource'

/** Seconds per question. Single source of truth so it can be made user-selectable later. */
export const QUESTION_TIME_SECONDS = 10
/** Questions fetched once at match start, then drawn locally (OpenTDB rate limits). */
export const QUESTION_BATCH = 30

export type MatchPhase = 'idle' | 'loading' | 'active' | 'error'

export interface MatchState {
  phase: MatchPhase
  questions: Question[]
  questionIndex: number
  shootout: ShootoutState
  error?: string
}

const initialState: MatchState = {
  phase: 'idle',
  questions: [],
  questionIndex: 0,
  shootout: createInitialState(),
}

type Listener = () => void

function createMatchStore() {
  let state = initialState
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

  async function start() {
    set({ phase: 'loading', error: undefined })
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

  /** Resolve the current kick. `correct === false` also covers a timeout. */
  function submitAnswer(correct: boolean) {
    if (state.phase !== 'active' || isMatchOver(state.shootout)) return
    const shootout = applyAnswer(state.shootout, correct)
    // ponytail: index wraps so a long sudden death never runs the pool dry;
    // swap for a no-repeat draw if question reuse becomes noticeable.
    const questionIndex = (state.questionIndex + 1) % state.questions.length
    set({ shootout, questionIndex })
  }

  function reset() {
    set(initialState)
  }

  return { getState, subscribe, getCurrentQuestion, start, submitAnswer, reset }
}

export const matchStore = createMatchStore()
