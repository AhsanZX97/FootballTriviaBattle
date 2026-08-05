import { useEffect, useRef } from 'react'
import { useSuppressBanner } from '../../../services/ads'
import { DailyRewardCard } from './DailyRewardCard'
import './DailyRewardPopup.css'
import { useT } from '../../../services/i18n/store'

type Props = {
  onClose: () => void
}

/** Auto-shown once per day on the intro when a signed-in player has a login
 * reward waiting. Same modal language as the friends/shop popups. After a
 * successful claim it lingers briefly so the coin burst plays, then closes. */
export function DailyRewardPopup({ onClose }: Props) {
  const t = useT()
  useSuppressBanner()
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Escape / backdrop dismiss, matching the app's other overlays.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => () => clearTimeout(closeTimer.current), [])

  return (
    <div
      className="daily-popup"
      role="dialog"
      aria-modal="true"
      aria-label={t('dailyReward.popupAria')}
      onClick={onClose}
    >
      <div className="daily-popup__panel" onClick={(e) => e.stopPropagation()}>
        <div className="daily-popup__head">
          <h2 className="daily-popup__title">{t('dailyReward.welcomeBack')}</h2>
          <button
            type="button"
            className="daily-popup__close"
            aria-label={t('common.closeAria')}
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="daily-popup__body">
          <DailyRewardCard
            onClaimed={() => {
              closeTimer.current = setTimeout(onClose, 1600)
            }}
          />
        </div>
      </div>
    </div>
  )
}
