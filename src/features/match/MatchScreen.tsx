import { useEffect, useState, useSyncExternalStore } from 'react'
import type { Kick, Stage } from '../../types/match'
import { getResult, KICKS_PER_SIDE } from '../../game/shootout'
import { matchStore, QUESTION_TIME_SECONDS } from './store'
import { PitchScene, type SceneFeedback } from './components/PitchScene'
import './MatchScreen.css'

/** How long the goal/save/miss animation plays before the next question. */
export const FEEDBACK_MS = 1400

function feedbackOf(stage: Stage, correct: boolean): SceneFeedback {
  if (stage === 'shoot') return correct ? 'goal' : 'miss'
  return correct ? 'save' : 'concede'
}

type Props = {
  /** Called from the result screen's Play Again — App switches back to the intro. */
  onExit?: () => void
}

// ponytail: sub-components live in this file; split into components/ when
// they grow (PitchScene already graduated there).

function KickDots({ kicks, side }: { kicks: Kick[]; side: 'user' | 'cpu' }) {
  const own = kicks.filter((k) => k.stage === (side === 'user' ? 'shoot' : 'keep'))
  const slots = Math.max(KICKS_PER_SIDE, own.length)
  return (
    <div className="match__dots" aria-label={`${side} kicks`}>
      {Array.from({ length: slots }, (_, i) => {
        const kick = own[i]
        return (
          <span key={i} className="match__dot">
            {kick ? (kick.scoredBy === side ? '⚽' : '❌') : '·'}
          </span>
        )
      })}
    </div>
  )
}

export function MatchScreen({ onExit }: Props) {
  const state = useSyncExternalStore(matchStore.subscribe, matchStore.getState)
  const [feedback, setFeedback] = useState<SceneFeedback | null>(null)
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME_SECONDS)

  const question = matchStore.getCurrentQuestion()
  const result = getResult(state.shootout)

  // countdown — paused while feedback plays and once the match is over
  useEffect(() => {
    if (state.phase !== 'active' || feedback || result) return
    if (timeLeft <= 0) {
      setFeedback(feedbackOf(state.shootout.stage, false)) // timeout = miss/concede
      return
    }
    const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [state.phase, state.shootout.stage, timeLeft, feedback, result])

  // let the animation play, then resolve the kick and reset the clock
  useEffect(() => {
    if (!feedback) return
    const t = setTimeout(() => {
      matchStore.submitAnswer(feedback === 'goal' || feedback === 'save')
      setFeedback(null)
      setTimeLeft(QUESTION_TIME_SECONDS)
    }, FEEDBACK_MS)
    return () => clearTimeout(t)
  }, [feedback])

  if (result) {
    return (
      <main className="match match--message">
        <p className="match__result">{result.outcome === 'win' ? '🏆 YOU WIN' : '💀 YOU LOSE'}</p>
        <p className="match__final-score">
          {result.userScore} – {result.cpuScore}
        </p>
        <button type="button" className="match__answer" onClick={onExit}>
          PLAY AGAIN
        </button>
      </main>
    )
  }

  if (state.phase === 'loading') {
    return (
      <main className="match match--message">
        <p className="match__status">LOADING QUESTIONS…</p>
      </main>
    )
  }

  if (state.phase === 'error' || !question) {
    return (
      <main className="match match--message">
        <p className="match__status">COULDN'T LOAD QUESTIONS</p>
        <button type="button" className="match__answer" onClick={() => matchStore.start()}>
          RETRY
        </button>
      </main>
    )
  }

  const { shootout } = state
  const shooting = shootout.stage === 'shoot'

  return (
    <main className="match">
      <section className="match__scoreboard" aria-label="scoreboard">
        <div className="match__team">
          <span className="match__team-name">YOU</span>
          {/* key remounts the span so the pop animation replays on each score */}
          <span key={shootout.userScore} className="match__score">
            {shootout.userScore}
          </span>
          <KickDots kicks={shootout.kicks} side="user" />
        </div>
        <span className="match__vs">–</span>
        <div className="match__team">
          <span className="match__team-name">CPU</span>
          <span key={shootout.cpuScore} className="match__score">
            {shootout.cpuScore}
          </span>
          <KickDots kicks={shootout.kicks} side="cpu" />
        </div>
      </section>

      <p className="match__stage">{shooting ? "⚽ YOU'RE SHOOTING" : "🧤 YOU'RE IN GOAL"}</p>

      {feedback ? (
        // animation screen: scene replaces the question until the kick resolves
        <PitchScene stage={shootout.stage} feedback={feedback} />
      ) : (
        <>
          <div className={`match__timer${timeLeft <= 3 ? ' match__timer--low' : ''}`}>
            <span className="match__timer-count">{timeLeft}</span>
            <progress className="match__timer-bar" max={QUESTION_TIME_SECONDS} value={timeLeft} />
          </div>

          <section className="match__card" aria-label="question">
            <p className="match__prompt">{question.prompt}</p>
            <div className="match__answers">
              {question.answers.map((answer) => (
                <button
                  key={answer}
                  type="button"
                  className="match__answer"
                  onClick={() => setFeedback(feedbackOf(shootout.stage, answer === question.correctAnswer))}
                >
                  {answer}
                </button>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  )
}
