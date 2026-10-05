import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import bg from '../../assets/bg.jpg'
import tick from '../../assets/levels/tick.png'
import { levelOf } from '../../game/levels/manifest'
import { isComplete, isSolved, levelProgress } from '../../game/levels/progress'
import { useT } from '../../services/i18n/store'
import { findItem } from '../../services/shopCatalogue'
import type { CustomizationSlot } from '../../types/customization'
import { shopStore } from '../shop/store'
import { categoryIcon } from './categoryIcon'
import { LevelCompletePopup } from './LevelCompletePopup'
import { PrizeBadge } from './PrizeBadge'
import { levelStore, type LevelStore, type PrizeResult } from './store'
import '../menu/IntroScreen.css'
import './LevelScreen.css'

type Props = {
  level: number
  onBack: () => void
  onOpen: (questionId: string) => void
  /** Defaults to the real singleton; tests inject one. */
  store?: Pick<LevelStore, 'getState' | 'subscribe' | 'claimPrize'>
  /** Equips a won prize item. Defaults to the shop store. */
  equip?: (slot: CustomizationSlot, itemId: string) => Promise<boolean>
}

type Revealed = Extract<PrizeResult, { kind: 'item' | 'coins' }>

const shopEquip = (slot: CustomizationSlot, itemId: string) => shopStore.equip(slot, itemId)

export function LevelScreen({ level, onBack, onOpen, store = levelStore, equip = shopEquip }: Props) {
  const t = useT()
  const state = useSyncExternalStore(store.subscribe, store.getState)
  const def = levelOf(level)
  const [revealed, setRevealed] = useState<Revealed | null>(null)
  const [claimFailed, setClaimFailed] = useState(false)
  const autoClaimed = useRef(false)

  const complete = def ? isComplete(def, state.solved) : false
  const claimed = state.prizes.includes(level)

  const claim = useCallback(async () => {
    setClaimFailed(false)
    const result = await store.claimPrize(level)
    if (result.kind === 'item' || result.kind === 'coins') setRevealed(result)
    else if (result.kind === 'error') setClaimFailed(true)
  }, [store, level])

  // Landing back on a finished grid pays its prize. Once per visit: a failed
  // signed-in claim waits for the retry button rather than looping.
  useEffect(() => {
    if (!complete || claimed || autoClaimed.current) return
    autoClaimed.current = true
    void claim()
  }, [complete, claimed, claim])

  if (!def) return null
  const { solved, total } = levelProgress(def, state.solved)
  const revealedItem = revealed?.kind === 'item' ? findItem(revealed.itemId) : undefined

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

        <header className={`pixel-card${complete ? ' pixel-card--done' : ''}`}>
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
          <PrizeBadge prize={def.prize} claimed={claimed} />
        </header>

        {complete && !claimed && claimFailed && (
          <button type="button" className="pixel-card pixel-card--center" onClick={() => void claim()}>
            <span className="pixel-card__title">CLAIM PRIZE</span>
          </button>
        )}

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

      {revealed && (
        <LevelCompletePopup
          level={level}
          result={revealed}
          onEquip={revealedItem ? () => equip(revealedItem.slot, revealedItem.id) : undefined}
          onClose={() => setRevealed(null)}
        />
      )}
    </main>
  )
}
