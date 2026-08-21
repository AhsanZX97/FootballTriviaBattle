import { useState, useSyncExternalStore } from 'react'
import { authStore } from '../../auth/store'
import { localProgressStore } from '../../progress/store'
import { CoinReward } from '../../match/components/CoinReward'
import { claimableReward } from '../../../services/dailyChallenges'
import { DAILY_REWARD_CYCLE, dailyRewardFor } from '../../../types/daily'
import coinSprite from '../../../assets/sprites/coin.png'
import trophySprite from '../../../assets/sprites/trophy.png'
import './DailyRewardCard.css'
import { useT } from '../../../services/i18n/store'

type Props = {
  /** Fired after a successful claim with the coins granted — lets a host popup
   * celebrate/close. Not called for an already-claimed day. */
  onClaimed?: (reward: number) => void
}

const DAYS = Array.from({ length: DAILY_REWARD_CYCLE }, (_, i) => i + 1)

/** The 7-day login-reward tracker plus its Claim button. Reused by the auto
 * popup and the account tab's Daily panel.
 *
 * Signed in this is server-authoritative — streak from the profile, payout
 * through the RPC. Signed out the very same cycle runs against on-device state
 * and pays on-device coins, because "come back tomorrow" is the one hook that
 * has to work *before* a player has any reason to make an account. The streak
 * carries into the profile when they eventually claim. */
export function DailyRewardCard({ onClaimed }: Props) {
  const t = useT()
  const auth = useSyncExternalStore(authStore.subscribe, authStore.getState)
  const local = useSyncExternalStore(localProgressStore.subscribe, localProgressStore.getState)
  const [busy, setBusy] = useState(false)
  const [burst, setBurst] = useState<number | null>(null)

  const signedIn = auth.status === 'signedIn'
  // While `loading`, neither source is settled — read the account's (zeroed)
  // state rather than offering a local claim the session is about to replace.
  const useLocal = auth.status === 'signedOut'
  const status = useLocal
    ? claimableReward(local.dailyRewardStreak, local.lastDailyRewardDate)
    : claimableReward(auth.dailyRewardStreak, auth.lastDailyRewardDate)
  // Days strictly before today in the current cycle are already banked.
  const claimedCount = status.claimable ? status.day - 1 : status.day

  async function handleClaim() {
    if (busy || !status.claimable) return

    if (useLocal) {
      // Purely local: no round trip, so no busy state to show.
      const res = localProgressStore.claimDailyReward()
      if (res) {
        setBurst(res.reward)
        onClaimed?.(res.reward)
      }
      return
    }

    setBusy(true)
    const res = await authStore.claimDailyReward()
    setBusy(false)
    if (res && !res.alreadyClaimed && res.reward > 0) {
      setBurst(res.reward)
      onClaimed?.(res.reward)
    }
  }

  return (
    <section className="daily-reward" aria-label={t('dailyReward.aria')}>
      <h3 className="daily-reward__title">{t('dailyReward.title')}</h3>

      <ol className="daily-reward__track">
        {DAYS.map((day) => {
          const isMilestone = day === DAILY_REWARD_CYCLE
          const state =
            day <= claimedCount ? 'claimed' : status.claimable && day === status.day ? 'today' : 'upcoming'
          return (
            <li key={day} className={`daily-reward__day daily-reward__day--${state}`}>
              <span className="daily-reward__day-label">
                {isMilestone
                  ? t('dailyReward.milestone', { day: DAILY_REWARD_CYCLE })
                  : t('dailyReward.dayShort', { day })}
              </span>
              <img
                className="daily-reward__day-icon"
                src={isMilestone ? trophySprite : coinSprite}
                alt=""
                aria-hidden
              />
              <span className="daily-reward__day-amount">+{dailyRewardFor(day)}</span>
              {state === 'claimed' && (
                <span className="daily-reward__day-check" aria-hidden>
                  ✓
                </span>
              )}
            </li>
          )
        })}
      </ol>

      {burst !== null ? (
        <div className="daily-reward__burst">
          <CoinReward amount={burst} />
        </div>
      ) : !signedIn && !useLocal ? (
        // Still resolving the session — say nothing rather than flash a claim.
        <p className="daily-reward__note">{t('common.loading')}</p>
      ) : status.claimable ? (
        <button
          type="button"
          className="daily-reward__claim"
          onClick={() => void handleClaim()}
          disabled={busy}
        >
          {busy ? t('dailyReward.claiming') : t('dailyReward.claim', { amount: status.reward })}
        </button>
      ) : (
        <p className="daily-reward__note">{t('dailyReward.claimed')}</p>
      )}
    </section>
  )
}
