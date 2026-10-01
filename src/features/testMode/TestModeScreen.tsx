import { useEffect, useState, useSyncExternalStore } from 'react'
import type { Stage } from '../../types/match'
import type { Question } from '../../types/trivia'
import { PitchScene, type SceneFeedback } from '../match/components/PitchScene'
import type { KeeperReaction, ShotEvent } from '../match/engine/shotTimeline'
import { QUESTION_TIME_SECONDS } from '../match/store'
import { authStore } from '../auth/store'
import { fadeOutCrowd, play, playGoalCelebration } from '../../services/sound'
import { i18nStore } from '../../services/i18n/store'
import { localisedBank } from '../../services/trivia/bank/localised'
import { sampleQuestions } from '../../services/trivia/sampler'
import '../match/MatchScreen.css'
import './TestModeScreen.css'

import { playerPortrait } from '../match/playerPortrait'
import { pictures } from '../../services/trivia/bank/pictures'

type Props = { onExit: () => void }

const PICTURE_ENTRIES = pictures

type Shot = { label: string; stage: Stage; feedback: SceneFeedback; reaction?: KeeperReaction }

const SHOTS: Shot[] = [
  { label: 'Dive right · goal', stage: 'shoot', feedback: 'goal', reaction: 'wrong-way' },
  { label: 'Dive left · late goal', stage: 'shoot', feedback: 'goal', reaction: 'late' },
  { label: 'Keeper stays · goal', stage: 'shoot', feedback: 'goal', reaction: 'frozen' },
  { label: 'Miss', stage: 'shoot', feedback: 'miss' },
  { label: 'Dive left · save', stage: 'keep', feedback: 'save' },
  { label: 'Concede', stage: 'keep', feedback: 'concede' },
]

function feedbackOf(stage: Stage, correct: boolean): SceneFeedback {
  if (stage === 'shoot') return correct ? 'goal' : 'miss'
  return correct ? 'save' : 'concede'
}

/** Dev-only sandbox: the real pitch and question card, driven by buttons
 * instead of a server. Never touches matchStore, coins, history or challenges. */
export function TestModeScreen({ onExit }: Props) {
  const auth = useSyncExternalStore(authStore.subscribe, authStore.getState)
  const [stage, setStage] = useState<Stage>('shoot')
  const [feedback, setFeedback] = useState<SceneFeedback | null>(null)
  const [reaction, setReaction] = useState<KeeperReaction | undefined>()
  const [question, setQuestion] = useState<Question | null>(null)
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME_SECONDS)
  const [panelOpen, setPanelOpen] = useState(true)
  const [pictureIndex, setPictureIndex] = useState(0)
  const busy = feedback !== null

  function shoot(nextStage: Stage, outcome: SceneFeedback, nextReaction?: KeeperReaction) {
    setQuestion(null)
    setStage(nextStage)
    setReaction(nextReaction)
    setFeedback(outcome)
  }

  function openTrivia() {
    setQuestion(sampleQuestions(localisedBank(i18nStore.getLocale()), 1)[0] ?? null)
    setTimeLeft(QUESTION_TIME_SECONDS)
  }

  function openPicture() {
    const at = pictureIndex % PICTURE_ENTRIES.length
    const entry = PICTURE_ENTRIES[at]
    const answers = [entry.correctAnswer, ...entry.wrongAnswers]
    const shift = at % answers.length
    setPictureIndex((i) => i + 1)
    setQuestion({
      id: `picture-${entry.image}`,
      prompt: entry.prompt,
      correctAnswer: entry.correctAnswer,
      answers: [...answers.slice(shift), ...answers.slice(0, shift)],
      difficulty: entry.difficulty,
      category: 'Picture',
      image: entry.image,
    })
    setTimeLeft(QUESTION_TIME_SECONDS)
  }

  useEffect(() => {
    if (!question || feedback) return
    if (timeLeft <= 0) {
      shoot(stage, feedbackOf(stage, false))
      return
    }
    const timer = setTimeout(() => setTimeLeft((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [question, feedback, timeLeft, stage])

  useEffect(() => {
    if (!feedback) return
    return () => fadeOutCrowd()
  }, [feedback])

  function onPitchEvent(event: ShotEvent, outcome: SceneFeedback) {
    if (feedback !== outcome) return
    if (event === 'kick') play('kick')
    if (event === 'impact') {
      if (outcome === 'goal' || outcome === 'concede') play('netRipple')
      if (outcome === 'goal') playGoalCelebration(auth.customization.goalSound)
      else play(outcome === 'save' ? 'cheer' : 'shock')
    }
    if (event === 'complete') setFeedback(null)
  }

  const showQuestion = question !== null && !feedback

  return (
    <main className={`match testmode${showQuestion ? '' : ' match--scene'}`}>
      <PitchScene
        stage={stage}
        feedback={feedback}
        reaction={reaction}
        opponentLabel="Test Bot"
        ballSkin={auth.customization.ballSkin}
        gkSkin={auth.customization.gkSkin}
        dimmed={showQuestion}
        onEvent={onPitchEvent}
      />

      {showQuestion && (
        <>
          <div className={`match__timer${timeLeft <= 3 ? ' match__timer--low' : ''}`}>
            <span className="match__timer-count">{timeLeft}</span>
            <progress className="match__timer-bar" max={QUESTION_TIME_SECONDS} value={timeLeft} />
          </div>
          <section className="match__card" aria-label="Test question">
            <p className="match__prompt">{question.prompt}</p>
            {playerPortrait(question.image) && (
              <img
                className="match__picture"
                src={playerPortrait(question.image)}
                alt={question.prompt}
              />
            )}
            <div className="match__answers">
              {question.answers.map((answer) => (
                <button
                  key={answer}
                  type="button"
                  className="match__answer"
                  onClick={() => shoot(stage, feedbackOf(stage, answer === question.correctAnswer))}
                >
                  {answer}
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      <aside className="testmode__panel" aria-label="Test mode controls">
        <button type="button" className="testmode__toggle" onClick={() => setPanelOpen((open) => !open)}>
          {panelOpen ? 'TEST ▾' : 'TEST ▸'}
        </button>
        {panelOpen && (
          <div className="testmode__buttons">
            {SHOTS.map((shot) => (
              <button
                key={shot.label}
                type="button"
                className="testmode__btn"
                disabled={busy}
                onClick={() => shoot(shot.stage, shot.feedback, shot.reaction)}
              >
                {shot.label}
              </button>
            ))}
            <button type="button" className="testmode__btn" disabled={busy} onClick={openTrivia}>
              Trivia
            </button>
            <button type="button" className="testmode__btn" disabled={busy} onClick={openPicture}>
              Picture {(pictureIndex % PICTURE_ENTRIES.length) + 1}/{PICTURE_ENTRIES.length}
            </button>
            <button
              type="button"
              className="testmode__btn"
              disabled={busy}
              onClick={() => setStage((s) => (s === 'shoot' ? 'keep' : 'shoot'))}
            >
              Stage: {stage}
            </button>
            <button type="button" className="testmode__btn testmode__btn--exit" onClick={onExit}>
              Exit
            </button>
          </div>
        )}
      </aside>
    </main>
  )
}
