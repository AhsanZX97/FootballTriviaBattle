import type { CSSProperties } from 'react'
import coinSpinSheet from '../../../assets/sprites/coinSpinSheet.png'
import './CoinReward.css'
import { useT } from '../../../services/i18n/store'

type Props = {
  /** Coins gained this match (the balance delta). Null or <= 0 renders nothing. */
  amount: number | null
}

/** Spinning gold coin + "+N", shown above the result on screens where the
 * player gained coins. Renders nothing when there was no gain (a loss, a
 * forfeit quitter, a rate-limited award), so it never says "+0". */
export function CoinReward({ amount }: Props) {
  const t = useT()
  if (!amount || amount <= 0) return null
  return (
    <div className="coin-reward" role="status" aria-label={t('coinReward.aria', { amount })}>
      <span
        className="coin-reward__coin"
        style={{ '--coin-sheet': `url(${coinSpinSheet})` } as CSSProperties}
        aria-hidden
      />
      <span className="coin-reward__amount" aria-hidden>
        {'+ '}
        {amount}
      </span>
    </div>
  )
}
