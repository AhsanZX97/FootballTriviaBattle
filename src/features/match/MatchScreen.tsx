import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Kick, Stage } from '../../types/match'
import { getResult, KICKS_PER_SIDE } from '../../game/shootout'
import { matchStore, QUESTION_TIME_SECONDS } from './store'
import { PitchScene, type SceneFeedback } from './components/PitchScene'
import { PreMatchCountdown } from '../lobby/components/PreMatchCountdown'
import { fadeOutCrowd, play } from '../../services/sound'
import { useBottomBanner } from '../../services/ads'
import { Sprite } from '../../components/Sprite'
import './MatchScreen.css'

/** Animation screen duration: 1s suspense delay + 0.7s animation + a beat to read the outcome. */
export const FEEDBACK_MS = 2600

/** Ball leaves the foot at PitchScene.css's --suspense mark. */
const KICK_SOUND_MS = 1000
/** Ball lands (net/keeper/crowd) at --suspense + flight time per outcome. */
const LAND_MS: Record<SceneFeedback, number> = {
  goal: 1700,
  miss: 1700,
  save: 1500,
  concede: 1700,
}

function feedbackOf(stage: Stage, correct: boolean): SceneFeedback {
  if (stage === 'shoot') return correct ? 'goal' : 'miss'
  return correct ? 'save' : 'concede'
}

type Props = {
  /** Called from the connection-lost screen and the result screen's Lobby (1v1) button. */
  onExit?: () => void
  /** Called from the result screens' Main Menu button — returns to the intro screen. */
  onMainMenu?: () => void
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
            {kick ? <Sprite name={kick.scoredBy === side ? 'ball' : 'miss'} /> : '·'}
          </span>
        )
      })}
    </div>
  )
}

export function MatchScreen({ onExit, onMainMenu }: Props) {
  const state = useSyncExternalStore(matchStore.subscribe, matchStore.getState)
  const [feedback, setFeedback] = useState<SceneFeedback | null>(null)
  const [feedbackIsMine, setFeedbackIsMine] = useState(false)
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME_SECONDS)
  const kicksSeenRef = useRef(0)

  const question = matchStore.getCurrentQuestion()
  const result = getResult(state.shootout)
  const myTurn = state.shootout.stage === 'shoot'
  const is1v1 = state.mode === '1v1'
  const opponentLabel = is1v1 ? (state.opponentName ?? 'OPPONENT') : 'CPU'

  // countdown — paused while feedback plays and once the match is over. During
  // an opponent's turn it just ticks cosmetically: the server owns their real timeout.
  useEffect(() => {
    if (state.phase !== 'active' || feedback || result) return
    if (timeLeft <= 0) {
      if (!is1v1 || myTurn) {
        setFeedbackIsMine(true)
        setFeedback(feedbackOf(state.shootout.stage, false)) // timeout = miss/concede
      }
      return
    }
    const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [state.phase, state.shootout.stage, timeLeft, feedback, result, is1v1, myTurn])

  // sound track for the feedback animation: kick when the ball launches, the
  // crowd + net when it lands. Cleanup fades the (30s-long) crowd file out as
  // the next question appears, and kills pending sounds if the screen unmounts.
  useEffect(() => {
    if (!feedback) return
    const kickT = setTimeout(() => play('kick'), KICK_SOUND_MS)
    const landT = setTimeout(() => {
      if (feedback === 'goal' || feedback === 'concede') play('netRipple')
      play(feedback === 'goal' || feedback === 'save' ? 'cheer' : 'shock')
    }, LAND_MS[feedback])
    return () => {
      clearTimeout(kickT)
      clearTimeout(landT)
      fadeOutCrowd()
    }
  }, [feedback])

  // kickoff / full-time whistles. phase re-enters 'active' after each rematch,
  // so both matches get a kickoff whistle; `!!result` flips exactly once per match.
  useEffect(() => {
    if (state.phase === 'active') play('startWhistle')
  }, [state.phase])
  const matchOver = result !== null
  useEffect(() => {
    if (matchOver) play('finalWhistle')
  }, [matchOver])

  // ad banner joins the result screen; a rematch (result gone) or the
  // connection-lost screen takes it back down
  useBottomBanner(matchOver && !state.connectionLost)

  // let the animation play, then resolve the kick and reset the clock. In 1v1
  // mode a spectate-side animation (the opponent's kick) already had its
  // outcome applied via kickResolved — only my own kick needs sending on.
  useEffect(() => {
    if (!feedback) return
    const t = setTimeout(() => {
      if (is1v1) {
        if (feedbackIsMine) matchStore.submitAnswer1v1(feedback === 'goal' || feedback === 'save')
      } else {
        matchStore.submitAnswer(feedback === 'goal' || feedback === 'save')
      }
      setFeedback(null)
      setTimeLeft(QUESTION_TIME_SECONDS)
    }, FEEDBACK_MS)
    return () => clearTimeout(t)
  }, [feedback, is1v1, feedbackIsMine])

  // 1v1 only: replay the opponent's resolved kick as a feedback animation —
  // their side of the match store already applied it via kickResolved.
  useEffect(() => {
    const kicks = state.shootout.kicks
    const prevSeen = kicksSeenRef.current
    kicksSeenRef.current = kicks.length
    if (!is1v1 || kicks.length <= prevSeen || state.lastKickBy !== 'opponent') return
    const kick = kicks[kicks.length - 1]
    setFeedbackIsMine(false)
    setFeedback(feedbackOf(kick.stage, kick.correct))
  }, [state.shootout.kicks, is1v1, state.lastKickBy])

  // Server or our own link dropped mid-match (opponent-initiated drops arrive
  // as opponentLeft instead). Takes priority so the screen never just freezes.
  if (state.connectionLost) {
    return (
      <main className="match match--message">
        <p className="match__result">
          <Sprite name="disconnect" /> CONNECTION LOST
        </p>
        <button
          type="button"
          className="match__answer"
          onClick={() => {
            matchStore.reset()
            onExit?.()
          }}
        >
          LOBBY
        </button>
      </main>
    )
  }

  if (result) {
    if (is1v1) {
      return (
        <main className="match match--message">
          <p className="match__result">
            {result.outcome === 'win' ? (
              <>
                <Sprite name="trophy" /> YOU WIN
              </>
            ) : (
              <>
                <Sprite name="skull" /> YOU LOSE
              </>
            )}
          </p>
          <p className="match__final-score">
            {result.userScore} – {result.cpuScore}
          </p>
          {state.opponentLeft ? (
            <p className="match__status">{opponentLabel} LEFT</p>
          ) : (
            <button
              type="button"
              className="match__answer"
              disabled={state.rematchIVoted}
              onClick={() => matchStore.voteRematch1v1()}
            >
              REMATCH ({state.rematchVotes}/2)
            </button>
          )}
          <button
            type="button"
            className="match__answer"
            onClick={() => {
              matchStore.leaveMatch1v1()
              onExit?.()
            }}
          >
            LOBBY
          </button>
          <button
            type="button"
            className="match__answer"
            onClick={() => {
              matchStore.leaveMatch1v1()
              onMainMenu?.()
            }}
          >
            MAIN MENU
          </button>
        </main>
      )
    }
    return (
      <main className="match match--message">
        <p className="match__result">
          {result.outcome === 'win' ? (
            <>
              <Sprite name="trophy" /> YOU WIN
            </>
          ) : (
            <>
              <Sprite name="skull" /> YOU LOSE
            </>
          )}
        </p>
        <p className="match__final-score">
          {result.userScore} – {result.cpuScore}
        </p>
        <button type="button" className="match__answer" onClick={() => void matchStore.start()}>
          PLAY AGAIN
        </button>
        <button
          type="button"
          className="match__answer"
          onClick={() => {
            matchStore.reset()
            onMainMenu?.()
          }}
        >
          MAIN MENU
        </button>
      </main>
    )
  }

  if (state.phase === 'rematchStarting') {
    return (
      <main className="match match--message">
        <PreMatchCountdown
          opponentName={opponentLabel}
          youGoFirst={state.shootout.stage === 'shoot'}
          skipFoundBeat
          onDone={() => matchStore.finishRematchStart()}
        />
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
  const showQuestion = !is1v1 || (myTurn && !state.pendingKick)
  // the pitch scene is on screen whenever the question isn't — full brightness
  const showScene = Boolean(feedback) || !showQuestion

  return (
    <main className={`match${showScene ? ' match--scene' : ''}`}>
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
          <span className="match__team-name">{opponentLabel}</span>
          <span key={shootout.cpuScore} className="match__score">
            {shootout.cpuScore}
          </span>
          <KickDots kicks={shootout.kicks} side="cpu" />
        </div>
      </section>

      <p className="match__stage">
        {is1v1 ? (
          myTurn ? (
            <>
              <Sprite name="ball" /> YOUR KICK
            </>
          ) : (
            <>⏳ {opponentLabel}'S KICK…</>
          )
        ) : myTurn ? (
          <>
            <Sprite name="ball" /> YOU'RE SHOOTING
          </>
        ) : (
          <>
            <Sprite name="glove" /> YOU'RE IN GOAL
          </>
        )}
      </p>

      {feedback ? (
        // animation screen: scene replaces the question until the kick resolves
        <PitchScene stage={shootout.stage} feedback={feedback} opponentLabel={opponentLabel} />
      ) : showQuestion ? (
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
                  onClick={() => {
                    setFeedbackIsMine(true)
                    setFeedback(feedbackOf(shootout.stage, answer === question.correctAnswer))
                  }}
                >
                  {answer}
                </button>
              ))}
            </div>
          </section>
        </>
      ) : (
        // 1v1 spectating (or the brief gap while my own kick is in flight to the server)
        <>
          <PitchScene stage={shootout.stage} feedback={null} />
          {!myTurn && <p className="match__waiting">WAITING FOR {opponentLabel}…</p>}
        </>
      )}
    </main>
  )
}
