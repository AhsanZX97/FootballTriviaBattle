import type { CSSProperties } from 'react'
import coinSpinSheet from '../../../assets/sprites/coinSpinSheet.png'
import './CoinReward.css'

type Props = {
  /** Coins gained this match (the balance delta). Null or <= 0 renders nothing. */
  amount: number | null
}

/** Spinning gold coin + "+N", shown above the result on screens where the
 * player gained coins. Renders nothing when there was no gain (CPU loss,
 * forfeit quitter, rate-limited award), so it never says "+0". */
export function CoinReward({ amount }: Props) {
  if (!amount || amount <= 0) return null
  return (
    <div className="coin-reward" role="status" aria-label={`You earned ${amount} coins`}>
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
