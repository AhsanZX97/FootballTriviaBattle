import { useSyncExternalStore } from 'react'
import { authStore } from '../../auth/store'
import type { AuthStore } from '../../auth/store'
import { localProgressStore, type LocalProgressStore } from '../../progress/store'
import coinSprite from '../../../assets/sprites/coin.png'
import { useT } from '../../../services/i18n/store'

type Props = {
  /** Defaults to the real singleton; tests inject a fake. */
  store?: AuthStore
  /** Defaults to the real singleton; tests inject a fake. */
  progress?: LocalProgressStore
  /** When given, the counter becomes a button that opens the "get coins" flow
   * and grows a `+` affordance. Omitted, it stays a plain readout — the match
   * screen has nowhere to send a player who taps it. */
  onPress?: () => void
}

/** Coin balance next to the global SoundControl overlay.
 *
 * Signed out this shows what the player has earned on this device rather than
 * a flat 0 — the counter going up is the only sign a pre-account player has
 * that their play is being kept, and the reason they bother signing in later.
 * Still 0 while `loading`, when neither number is known to be right yet. */
export function CoinCounter({ store = authStore, progress = localProgressStore, onPress }: Props) {
  const t = useT()
  const state = useSyncExternalStore(store.subscribe, store.getState)
  const local = useSyncExternalStore(progress.subscribe, progress.getState)
  const coins = state.status === 'signedIn' ? state.coins : state.status === 'signedOut' ? local.coins : 0

  const inner = (
    <>
      <img className="coin-counter__icon" src={coinSprite} alt="" aria-hidden />
      <span className="coin-counter__bar">
        <span className="coin-counter__value">{coins}</span>
        {onPress && (
          <span className="coin-counter__plus" aria-hidden>
            +
          </span>
        )}
      </span>
    </>
  )

  if (!onPress) return <div className="coin-counter">{inner}</div>

  return (
    <button type="button" className="coin-counter coin-counter--action" aria-label={t('getcoins.getCoinsAria')} onClick={onPress}>
      {inner}
    </button>
  )
}
