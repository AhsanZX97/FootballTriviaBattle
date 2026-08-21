import { useEffect, useSyncExternalStore } from 'react'
import { challengesStore } from '../store'
import { authStore } from '../../auth/store'
import { DailyRewardCard } from './DailyRewardCard'
import coinSprite from '../../../assets/sprites/coin.png'
import './ChallengesPanel.css'
import { useT } from '../../../services/i18n/store'

/** The Daily tab of the account popup: the login-reward tracker on top, then the
 * three randomised daily challenges with their progress and coin claims. */
export function ChallengesPanel() {
  const t = useT()
  const state = useSyncExternalStore(challengesStore.subscribe, challengesStore.getState)
  const auth = useSyncExternalStore(authStore.subscribe, authStore.getState)
  const signedIn = auth.status === 'signedIn'

  // Recompute on open so a day rollover swaps in the fresh set.
  useEffect(() => {
    challengesStore.refresh()
  }, [])

  return (
    <div className="daily-challenges">
      <DailyRewardCard />

      <h3 className="daily-challenges__heading">{t('daily.heading')}</h3>
      <ul className="daily-challenges__list">
        {state.challenges.map(({ def, progress, complete, claimed }) => {
          const pct = Math.round((progress / def.goal) * 100)
          const claiming = state.claiming === def.id
          return (
            <li key={def.id} className={`daily-challenge${claimed ? ' daily-challenge--done' : ''}`}>
              <div className="daily-challenge__info">
                <span className="daily-challenge__title">{t(`daily.${def.id}.title`)}</span>
                <span className="daily-challenge__desc">
                  {t(`daily.${def.id}.desc`, { goal: def.goal })}
                </span>
                <div
                  className="daily-challenge__bar"
                  role="progressbar"
                  aria-valuenow={progress}
                  aria-valuemax={def.goal}
                >
                  <span className="daily-challenge__bar-fill" style={{ width: `${pct}%` }} />
                </div>
                <span className="daily-challenge__count">
                  {Math.min(progress, def.goal)} / {def.goal}
                </span>
              </div>

              <div className="daily-challenge__side">
                <span className="daily-challenge__reward">
                  <img className="daily-challenge__coin" src={coinSprite} alt="" aria-hidden />+
                  {def.reward}
                </span>
                {claimed ? (
                  <span className="daily-challenge__claimed" aria-label={t('daily.claimedAria')}>
                    ✓ {t('daily.done')}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="daily-challenge__claim"
                    disabled={!complete || claiming}
                    onClick={() => void challengesStore.claim(def.id)}
                  >
                    {claiming ? '…' : t('daily.claim')}
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {!signedIn && <p className="daily-challenges__note">{t('daily.signInNote')}</p>}
    </div>
  )
}
