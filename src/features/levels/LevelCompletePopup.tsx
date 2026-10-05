import { useEffect, useState } from 'react'
import chestOpen from '../../assets/levels/chest-open.png'
import { useSuppressBanner } from '../../services/ads'
import { CoinReward } from '../match/components/CoinReward'
import { prizeArt } from './prizeArt'
import type { PrizeResult } from './store'
import '../challenges/components/DailyRewardPopup.css'
import './LevelScreen.css'

type Props = {
  level: number
  result: Extract<PrizeResult, { kind: 'item' | 'coins' }>
  /** Equips a won item. Omitted for coin prizes. */
  onEquip?: () => Promise<boolean>
  onClose: () => void
}

/** The prize reveal after a level's last card. Same modal language as the
 * daily reward popup. */
export function LevelCompletePopup({ level, result, onEquip, onClose }: Props) {
  useSuppressBanner()
  const [equip, setEquip] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle')
  const title = `LEVEL ${level} COMPLETE!`

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function equipNow() {
    if (!onEquip) return
    setEquip('busy')
    setEquip((await onEquip()) ? 'done' : 'failed')
  }

  const item = result.kind === 'item' ? prizeArt({ kind: 'item', itemId: result.itemId }) : null
  const owned = result.kind === 'coins' && result.itemId ? prizeArt({ kind: 'item', itemId: result.itemId }) : null

  return (
    <div className="daily-popup" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="daily-popup__panel level-prize-popup" onClick={(e) => e.stopPropagation()}>
        <div className="daily-popup__head">
          <h2 className="daily-popup__title">{title}</h2>
        </div>
        <div className="daily-popup__body level-prize-popup__body">
          <img className="level-prize-popup__chest" src={chestOpen} alt="" aria-hidden />
          {item ? (
            <>
              <p className="level-prize-popup__label">YOU WON</p>
              <span className="level-prize level-prize--big" aria-hidden>
                <img className="level-prize__art" src={item.src} alt="" />
              </span>
              <p className="level-prize-popup__name">{item.name}</p>
            </>
          ) : (
            <>
              {owned && <p className="level-prize-popup__label">You already own {owned.name}</p>}
              <CoinReward amount={result.kind === 'coins' ? result.coins : null} />
            </>
          )}
          <div className="level-prize-popup__actions">
            {item && onEquip && (
              <button
                type="button"
                className={`pixel-card pixel-card--center${equip === 'done' ? ' pixel-card--done' : ''}`}
                disabled={equip === 'busy' || equip === 'done'}
                onClick={() => void equipNow()}
              >
                <span className="pixel-card__title">
                  {equip === 'done' ? 'EQUIPPED' : equip === 'failed' ? 'TRY AGAIN' : 'EQUIP NOW'}
                </span>
              </button>
            )}
            <button type="button" className="intro__play intro__play--secondary home__chip" onClick={onClose}>
              <span className="intro__play-label">CLOSE</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
