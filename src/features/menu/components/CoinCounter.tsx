import { useSyncExternalStore } from 'react'
import { authStore } from '../../auth/store'
import type { AuthStore } from '../../auth/store'

type Props = {
  /** Defaults to the real singleton; tests inject a fake. */
  store?: AuthStore
}

/** Coin balance next to the global SoundControl overlay. Shows 0 whenever the
 * player isn't signed in (logged out or still loading), per spec. */
export function CoinCounter({ store = authStore }: Props) {
  const state = useSyncExternalStore(store.subscribe, store.getState)
  const coins = state.status === 'signedIn' ? state.coins : 0

  return (
    <div className="coin-counter">
      <span className="coin-counter__icon" aria-hidden>
        🪙
      </span>
      <span className="coin-counter__value">{coins}</span>
    </div>
  )
}
