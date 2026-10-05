import tick from '../../assets/levels/tick.png'
import type { LevelPrize } from '../../game/levels/rewards'
import { prizeArt } from './prizeArt'

type Props = {
  prize: LevelPrize
  claimed: boolean
  /** Hide from assistive tech when the surrounding row already names it. */
  decorative?: boolean
}

/** A level's prize in a small dark well, ticked once it has been paid. */
export function PrizeBadge({ prize, claimed, decorative = false }: Props) {
  const { src, name } = prizeArt(prize)
  const label = `Prize: ${name}${claimed ? ', claimed' : ''}`
  return (
    <span
      className={`level-prize${claimed ? ' level-prize--claimed' : ''}`}
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label })}
    >
      <img className="level-prize__art" src={src} alt="" />
      {claimed && <img className="level-prize__tick" src={tick} alt="" />}
    </span>
  )
}
