import { useSyncExternalStore } from 'react'
import bg from '../../assets/bg.jpg'
import tick from '../../assets/levels/tick.png'
import { levelOf } from '../../game/levels/manifest'
import { isSolved, levelProgress } from '../../game/levels/progress'
import { useT } from '../../services/i18n/store'
import { categoryIcon } from './categoryIcon'
import { levelStore, type LevelStore } from './store'
import '../menu/IntroScreen.css'
import './LevelScreen.css'

type Props = {
  level: number
  onBack: () => void
  onOpen: (questionId: string) => void
  /** Defaults to the real singleton; tests inject one. */
  store?: Pick<LevelStore, 'getState' | 'subscribe'>
}

export function LevelScreen({ level, onBack, onOpen, store = levelStore }: Props) {
  const t = useT()
  const state = useSyncExternalStore(store.subscribe, store.getState)
  const def = levelOf(level)
  if (!def) return null
  const { solved, total } = levelProgress(def, state.solved)

  return (
    <main className="intro levels">
      <img className="intro__bg" src={bg} alt="" aria-hidden />
      <div className="intro__overlay levels__dim" aria-hidden />
      <div className="intro__scanlines" aria-hidden />
      <div className="levels__content">
        <div className="levels__header">
          <button type="button" className="intro__play intro__play--secondary home__chip" onClick={onBack}>
            <span className="intro__play-label">◂ {t('common.back')}</span>
          </button>
        </div>

        <header className={`pixel-card${solved === total ? ' pixel-card--done' : ''}`}>
          <span className="pixel-card__plate" role="img" aria-label={t('levels.level', { level })}>
            <span className="pixel-card__plate-label" aria-hidden>
              LV
            </span>
            <span className="pixel-card__plate-num" aria-hidden>
              {level}
            </span>
          </span>
          <span className="pixel-card__text">
            <h1 className="pixel-card__title">{def.title}</h1>
            <span className="pixel-card__bar">
              <progress className="pixel-progress" max={total} value={solved} />
              <span className="pixel-card__count">
                {solved}/{total}
              </span>
            </span>
          </span>
        </header>

        <div className="levels__grid">
          {def.questionIds.map((id, i) => {
            const done = isSolved(state.solved, id)
            const tries = state.tries[id] ?? 0
            const label = done
              ? t('levels.cardSolvedAria', { n: i + 1 })
              : t('levels.cardAria', { n: i + 1 })
            return (
              <button
                key={id}
                type="button"
                className={`level-card${done ? ' level-card--solved' : ''}${!done && tries > 0 ? ' level-card--tried' : ''}`}
                aria-label={label}
                onClick={() => onOpen(id)}
              >
                <span className="level-card__num" aria-hidden>
                  {i + 1}
                </span>
                <span className="level-card__well" aria-hidden>
                  <img className="level-card__icon" src={categoryIcon(id)} alt="" />
                  {done && <img className="level-card__tick" src={tick} alt="" />}
                </span>
                {!done && tries > 0 && (
                  <span className="level-card__tries" aria-hidden>
                    {'✕'.repeat(Math.min(tries, 3))}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </main>
  )
}
