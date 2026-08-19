import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Kick, Stage } from '../../types/match'
import { getResult, KICKS_PER_SIDE } from '../../game/shootout'
import { matchStore, QUESTION_TIME_SECONDS } from './store'
import { PitchScene, preloadSceneArt, type SceneFeedback } from './components/PitchScene'
import { CoinReward } from './components/CoinReward'
import { PreMatchCountdown } from '../lobby/components/PreMatchCountdown'
import { fadeOutCrowd, play, playGoalCelebration } from '../../services/sound'
import { authStore } from '../auth/store'
import { useBottomBanner } from '../../services/ads'
import { Sprite } from '../../components/Sprite'
import './MatchScreen.css'
import { useT } from '../../services/i18n/store'

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
  const t = useT()
  const own = kicks.filter((k) => k.stage === (side === 'user' ? 'shoot' : 'keep'))
  const slots = Math.max(KICKS_PER_SIDE, own.length)
  return (
    <div className="match__dots" aria-label={t('match.kicksAria', { side })}>
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
  const t = useT()
  const state = useSyncExternalStore(matchStore.subscribe, matchStore.getState)
  const auth = useSyncExternalStore(authStore.subscribe, authStore.getState)
  const [feedback, setFeedback] = useState<SceneFeedback | null>(null)
  const [feedbackIsMine, setFeedbackIsMine] = useState(false)
  // stage the animating kick happened in — the store's shootout.stage has
  // already flipped to the next kicker by the time an opponent kick animates
  const [feedbackStage, setFeedbackStage] = useState<Stage>('shoot')
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME_SECONDS)
  const kicksSeenRef = useRef(0)

  const question = matchStore.getCurrentQuestion()
  const result = getResult(state.shootout)
  const myTurn = state.shootout.stage === 'shoot'
  const opponentLabel = state.opponentName ?? t('match.opponent')
  const goalSound = auth.customization.goalSound
  // the keeper we shoot against wears the opponent's equipped skin
  const opponentGkSkin = state.opponentGkSkin ?? undefined

  // warm the equipped skins' sprite sheets before the first animation needs them
  useEffect(() => {
    preloadSceneArt(auth.customization.ballSkin, auth.customization.gkSkin, opponentGkSkin)
  }, [auth.customization.ballSkin, auth.customization.gkSkin, opponentGkSkin])

  // countdown — paused while feedback plays and once the match is over. During
  // an opponent's turn it just ticks cosmetically: the server owns their real timeout.
  useEffect(() => {
    if (state.phase !== 'active' || feedback || result) return
    if (timeLeft <= 0) {
      if (myTurn) {
        setFeedbackIsMine(true)
        setFeedbackStage(state.shootout.stage)
        setFeedback(feedbackOf(state.shootout.stage, false)) // timeout = miss/concede
      }
      return
    }
    const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [state.phase, state.shootout.stage, timeLeft, feedback, result, myTurn])

  // sound track for the feedback animation: kick when the ball launches, the
  // crowd + net when it lands. Cleanup fades the (30s-long) crowd file out as
  // the next question appears, and kills pending sounds if the screen unmounts.
  //
  // 'goal' is the only outcome where the player scores, so it's the one the
  // shop's goal celebration replaces; a save still gets the stock cheer.
  useEffect(() => {
    if (!feedback) return
    const kickT = setTimeout(() => play('kick'), KICK_SOUND_MS)
    const landT = setTimeout(() => {
      if (feedback === 'goal' || feedback === 'concede') play('netRipple')
      if (feedback === 'goal') playGoalCelebration(goalSound)
      else play(feedback === 'save' ? 'cheer' : 'shock')
    }, LAND_MS[feedback])
    return () => {
      clearTimeout(kickT)
      clearTimeout(landT)
      fadeOutCrowd()
    }
  }, [feedback, goalSound])

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

  // let the animation play, then resolve the kick and reset the clock. A
  // spectate-side animation (the opponent's kick) already had its outcome
  // applied via kickResolved — only my own kick needs sending on.
  useEffect(() => {
    if (!feedback) return
    const t = setTimeout(() => {
      if (feedbackIsMine) matchStore.submitAnswer1v1(feedback === 'goal' || feedback === 'save')
      setFeedback(null)
      setTimeLeft(QUESTION_TIME_SECONDS)
    }, FEEDBACK_MS)
    return () => clearTimeout(t)
  }, [feedback, feedbackIsMine])

  // Replay the opponent's resolved kick as a feedback animation — their side
  // of the match store already applied it via kickResolved. Layout
  // effect, not useEffect: the store has already flipped stage to 'shoot' by
  // the time this runs, so a passive effect would let the question screen
  // paint for a frame before the feedback scene replaces it.
  useLayoutEffect(() => {
    const kicks = state.shootout.kicks
    const prevSeen = kicksSeenRef.current
    kicksSeenRef.current = kicks.length
    if (kicks.length <= prevSeen || state.lastKickBy !== 'opponent') return
    const kick = kicks[kicks.length - 1]
    setFeedbackIsMine(false)
    setFeedbackStage(kick.stage)
    setFeedback(feedbackOf(kick.stage, kick.correct))
  }, [state.shootout.kicks, state.lastKickBy])

  // Server or our own link dropped mid-match (opponent-initiated drops arrive
  // as opponentLeft instead). Takes priority so the screen never just freezes.
  if (state.connectionLost) {
    return (
      <main className="match match--message">
        <p className="match__result">
          <Sprite name="disconnect" /> {t('match.connectionLost')}
        </p>
        <button
          type="button"
          className="match__answer"
          onClick={() => {
            matchStore.reset()
            onExit?.()
          }}
        >
          {t('match.lobby')}
        </button>
      </main>
    )
  }

  if (result) {
    return (
      <main className="match match--message">
        <CoinReward amount={state.coinsAwarded} />
        <p className="match__result">
          {state.matchAbandoned
            ? t('match.abandoned')
            : result.outcome === 'win'
              ? t('match.youWin')
              : t('match.youLose')}
        </p>
        <p className="match__final-score">
          {result.userScore} – {result.cpuScore}
        </p>
        {state.opponentLeft ? (
          <p className="match__status">{t('match.opponentLeft', { name: opponentLabel })}</p>
        ) : (
          <button
            type="button"
            className="match__answer"
            disabled={state.rematchIVoted}
            onClick={() => matchStore.voteRematch1v1()}
          >
            {t('match.rematch', { votes: state.rematchVotes })}
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
          {t('match.lobby')}
        </button>
        <button
          type="button"
          className="match__answer"
          onClick={() => {
            matchStore.leaveMatch1v1()
            onMainMenu?.()
          }}
        >
          {t('match.mainMenu')}
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

  // The session always arrives with its questions, so this is a "should never
  // happen" guard rather than a load state — it just offers a way out.
  if (!question) {
    return (
      <main className="match match--message">
        <p className="match__status">{t('match.loadFailed')}</p>
        <button
          type="button"
          className="match__answer"
          onClick={() => {
            matchStore.leaveMatch1v1()
            onExit?.()
          }}
        >
          {t('match.lobby')}
        </button>
      </main>
    )
  }

  const { shootout } = state
  const showQuestion = myTurn && !state.pendingKick
  // the pitch scene is on screen whenever the question isn't — full brightness
  const showScene = Boolean(feedback) || !showQuestion

  return (
    <main className={`match${showScene ? ' match--scene' : ''}`}>
      <section className="match__scoreboard" aria-label={t('match.scoreboardAria')}>
        <div className="match__team">
          <span className="match__team-name">{t('match.you')}</span>
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
        {myTurn ? (
          <>
            <Sprite name="ball" /> {t('match.yourKick')}
          </>
        ) : (
          <>⏳ {t('match.opponentKick', { name: opponentLabel })}</>
        )}
      </p>

      {feedback ? (
        // animation screen: scene replaces the question until the kick resolves
        <PitchScene
          stage={feedbackStage}
          feedback={feedback}
          opponentLabel={opponentLabel}
          ballSkin={auth.customization.ballSkin}
          gkSkin={auth.customization.gkSkin}
          opponentGkSkin={opponentGkSkin}
        />
      ) : showQuestion ? (
        <>
          <div className={`match__timer${timeLeft <= 3 ? ' match__timer--low' : ''}`}>
            <span className="match__timer-count">{timeLeft}</span>
            <progress className="match__timer-bar" max={QUESTION_TIME_SECONDS} value={timeLeft} />
          </div>

          <section className="match__card" aria-label={t('match.questionAria')}>
            <p className="match__prompt">{question.prompt}</p>
            <div className="match__answers">
              {question.answers.map((answer) => (
                <button
                  key={answer}
                  type="button"
                  className="match__answer"
                  onClick={() => {
                    setFeedbackIsMine(true)
                    setFeedbackStage(shootout.stage)
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
        // spectating (or the brief gap while my own kick is in flight to the server)
        <>
          <PitchScene
            stage={shootout.stage}
            feedback={null}
            ballSkin={auth.customization.ballSkin}
            gkSkin={auth.customization.gkSkin}
            opponentGkSkin={opponentGkSkin}
          />
          {!myTurn && (
            <p className="match__waiting">{t('match.waitingFor', { name: opponentLabel })}</p>
          )}
        </>
      )}
    </main>
  )
}
