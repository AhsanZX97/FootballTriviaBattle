import { useState, useSyncExternalStore } from 'react'
import { authStore } from '../../auth/store'
import { CoinReward } from '../../match/components/CoinReward'
import { claimableReward } from '../../../services/dailyChallenges'
import { DAILY_REWARD_CYCLE, dailyRewardFor } from '../../../types/daily'
import coinSprite from '../../../assets/sprites/coin.png'
import trophySprite from '../../../assets/sprites/trophy.png'
import './DailyRewardCard.css'

type Props = {
  /** Fired after a successful claim with the coins granted — lets a host popup
   * celebrate/close. Not called for an already-claimed day. */
  onClaimed?: (reward: number) => void
}

const DAYS = Array.from({ length: DAILY_REWARD_CYCLE }, (_, i) => i + 1)

/** The 7-day login-reward tracker plus its Claim button. Server-authoritative:
 * the streak state comes from the profile and claiming goes through the RPC.
 * Reused by the auto popup and the account tab's Daily panel. */
export function DailyRewardCard({ onClaimed }: Props) {
  const auth = useSyncExternalStore(authStore.subscribe, authStore.getState)
  const [busy, setBusy] = useState(false)
  const [burst, setBurst] = useState<number | null>(null)

  const signedIn = auth.status === 'signedIn'
  const status = claimableReward(auth.dailyRewardStreak, auth.lastDailyRewardDate)
  // Days strictly before today in the current cycle are already banked.
  const claimedCount = status.claimable ? status.day - 1 : status.day

  async function handleClaim() {
    if (busy || !status.claimable) return
    setBusy(true)
    const res = await authStore.claimDailyReward()
    setBusy(false)
    if (res && !res.alreadyClaimed && res.reward > 0) {
      setBurst(res.reward)
      onClaimed?.(res.reward)
    }
  }

  return (
    <section className="daily-reward" aria-label="Daily login reward">
      <h3 className="daily-reward__title">DAILY REWARD</h3>

      <ol className="daily-reward__track">
        {DAYS.map((day) => {
          const isMilestone = day === DAILY_REWARD_CYCLE
          const state =
            day <= claimedCount ? 'claimed' : status.claimable && day === status.day ? 'today' : 'upcoming'
          return (
            <li key={day} className={`daily-reward__day daily-reward__day--${state}`}>
              <span className="daily-reward__day-label">
                {isMilestone ? 'DAY 7' : `D${day}`}
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
      ) : !signedIn ? (
        <p className="daily-reward__note">Sign in to claim your daily reward.</p>
      ) : status.claimable ? (
        <button
          type="button"
          className="daily-reward__claim"
          onClick={() => void handleClaim()}
          disabled={busy}
        >
          {busy ? 'CLAIMING…' : `CLAIM +${status.reward}`}
        </button>
      ) : (
        <p className="daily-reward__note">Claimed! Come back tomorrow.</p>
      )}
    </section>
  )
}
