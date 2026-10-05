import { useEffect, useState, useSyncExternalStore } from 'react'
import coinSprite from '../../assets/sprites/coin.png'
import { coinsForTries } from '../../game/levels/rewards'
import { isSolved } from '../../game/levels/progress'
import { footballBank } from '../../services/trivia/bank'
import { useT } from '../../services/i18n/store'
import { fadeOutCrowd, play, playGoalCelebration } from '../../services/sound'
import { authStore } from '../auth/store'
import { playerPortrait } from '../match/playerPortrait'
import { CoinReward } from '../match/components/CoinReward'
import { PitchScene, type SceneFeedback } from '../match/components/PitchScene'
import type { ShotEvent } from '../match/engine/shotTimeline'
import { levelStore, type LevelStore } from './store'
import '../menu/IntroScreen.css'
import './LevelScreen.css'

type Props = {
  questionId: string
  onBack: () => void
  /** Defaults to the real singleton; tests inject one. */
  store?: Pick<LevelStore, 'getState' | 'subscribe' | 'answer'>
}

type Outcome =
  | { kind: 'wrong' }
  | { kind: 'correct'; answer: string; coins: number; alreadySolved: boolean }
  | { kind: 'error' }

function shuffle<T>(items: readonly T[]): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * One level card, played as a penalty: the answer is recorded at once, then
 * the shot plays out — a miss returns to the question, a goal reveals the
 * coins. The outcome only shows once the pitch reports `complete`, so the
 * reward never spoils the kick.
 */
export function LevelQuestion({ questionId, onBack, store = levelStore }: Props) {
  const t = useT()
  const state = useSyncExternalStore(store.subscribe, store.getState)
  const auth = useSyncExternalStore(authStore.subscribe, authStore.getState)
  const question = footballBank.find((q) => q.id === questionId)
  // Shuffled once per opening, so a retry can't be won by remembering a slot.
  const [answers] = useState(() =>
    question ? shuffle([question.correctAnswer, ...question.wrongAnswers]) : [],
  )
  const [wrongPicks, setWrongPicks] = useState<ReadonlySet<string>>(() => new Set())
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [shot, setShot] = useState<SceneFeedback | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!shot) return
    return () => fadeOutCrowd()
  }, [shot])

  if (!question) return null

  const solved = isSolved(state.solved, questionId)
  const finished = outcome?.kind === 'correct'
  const worth = coinsForTries(state.tries[questionId] ?? 0)
  const image = playerPortrait(question.image)

  async function choose(answer: string) {
    if (busy || finished || shot) return
    setBusy(true)
    const result = await store.answer(questionId, answer)
    setBusy(false)
    if (result.kind === 'wrong') {
      setWrongPicks((prev) => new Set(prev).add(answer))
      setOutcome({ kind: 'wrong' })
      setShot('miss')
    } else if (result.kind === 'correct') {
      setOutcome({ kind: 'correct', answer, coins: result.coins, alreadySolved: result.alreadySolved })
      setShot('goal')
    } else {
      setOutcome({ kind: 'error' })
    }
  }

  function onPitchEvent(event: ShotEvent, kicked: SceneFeedback) {
    if (kicked !== shot) return
    if (event === 'kick') play('kick')
    if (event === 'impact') {
      if (kicked === 'goal') {
        play('netRipple')
        playGoalCelebration(auth.customization.goalSound)
      } else {
        play('shock')
      }
    }
    if (event === 'complete') setShot(null)
  }

  function answerClass(answer: string): string {
    if (outcome?.kind === 'correct' && outcome.answer === answer) return ' level-q__answer--correct'
    if (wrongPicks.has(answer)) return ' level-q__answer--wrong'
    return ''
  }

  return (
    <main className="intro levels">
      <PitchScene
        stage="shoot"
        feedback={shot}
        ballSkin={auth.customization.ballSkin}
        gkSkin={auth.customization.gkSkin}
        dimmed={!shot}
        onEvent={onPitchEvent}
      />
      {!shot && <div className="intro__overlay levels__dim" aria-hidden />}

      {!shot && (
        <div className="levels__content level-q">
          <header className="levels__header level-q__header">
            <button type="button" className="intro__play intro__play--secondary home__chip" onClick={onBack}>
              <span className="intro__play-label">◂ {t('common.back')}</span>
            </button>
            {solved && !finished ? (
              <span className="level-q__badge level-q__badge--solved">{t('levels.solvedBadge')}</span>
            ) : !solved ? (
              <span className="level-q__badge" aria-label={t('levels.worthAria', { coins: worth })}>
                <img className="level-q__badge-coin" src={coinSprite} alt="" aria-hidden />+{worth}
              </span>
            ) : null}
          </header>

          {finished ? (
            <section className="level-q__result">
              <p className="level-q__msg level-q__msg--correct">{t('levels.correct')}</p>
              <p className="level-q__answer-reveal">{outcome.answer}</p>
              {outcome.alreadySolved ? (
                <p className="level-q__msg">{t('levels.alreadySolved')}</p>
              ) : (
                <CoinReward amount={outcome.coins} />
              )}
              <button type="button" className="pixel-card pixel-card--center" onClick={onBack}>
                <span className="pixel-card__title">{t('levels.continue')}</span>
              </button>
            </section>
          ) : (
            <>
              <section className="level-q__card">
                <p className="level-q__prompt">{question.prompt}</p>
                {image && <img className="level-q__picture" src={image} alt={question.prompt} />}
                <div className="level-q__answers">
                  {answers.map((answer) => (
                    <button
                      key={answer}
                      type="button"
                      className={`level-q__answer${answerClass(answer)}`}
                      disabled={busy || wrongPicks.has(answer)}
                      onClick={() => void choose(answer)}
                    >
                      {answer}
                    </button>
                  ))}
                </div>
              </section>
              <div className="level-q__feedback" aria-live="polite">
                {outcome?.kind === 'wrong' && (
                  <p className="level-q__msg level-q__msg--wrong">{t('levels.wrong')}</p>
                )}
                {outcome?.kind === 'error' && (
                  <p className="level-q__msg level-q__msg--wrong">{t('levels.saveFailed')}</p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </main>
  )
}
