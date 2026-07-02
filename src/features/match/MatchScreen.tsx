import { useSyncExternalStore } from 'react'
import type { Kick } from '../../types/match'
import { KICKS_PER_SIDE } from '../../game/shootout'
import { matchStore } from './store'
import './MatchScreen.css'

// ponytail: sub-components live in this file; split into components/ when
// milestone 9 (animations) makes them grow.

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

export function MatchScreen() {
  const state = useSyncExternalStore(matchStore.subscribe, matchStore.getState)
  const question = matchStore.getCurrentQuestion()

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
          <span className="match__score">{shootout.userScore}</span>
          <KickDots kicks={shootout.kicks} side="user" />
        </div>
        <span className="match__vs">–</span>
        <div className="match__team">
          <span className="match__team-name">CPU</span>
          <span className="match__score">{shootout.cpuScore}</span>
          <KickDots kicks={shootout.kicks} side="cpu" />
        </div>
      </section>

      <p className="match__stage">{shooting ? "⚽ YOU'RE SHOOTING" : "🧤 YOU'RE IN GOAL"}</p>

      <section className="match__card" aria-label="question">
        <p className="match__prompt">{question.prompt}</p>
        <div className="match__answers">
          {question.answers.map((answer) => (
            <button
              key={answer}
              type="button"
              className="match__answer"
              onClick={() => matchStore.submitAnswer(answer === question.correctAnswer)}
            >
              {answer}
            </button>
          ))}
        </div>
      </section>
    </main>
  )
}
