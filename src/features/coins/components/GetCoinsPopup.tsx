import { useEffect, useSyncExternalStore } from 'react'
import { coinsStore, REWARDED_AD_COINS, REWARDED_ADS_PER_DAY, type CoinsStore } from '../store'
import { authStore } from '../../auth/store'
import { Sprite } from '../../../components/Sprite'
import './GetCoinsPopup.css'
import { useT } from '../../../services/i18n/store'

type Props = {
  onClose: () => void
  /** Defaults to the real singleton; tests inject a fake. */
  store?: CoinsStore
}

/**
 * "Get coins" modal, opened from the coin counter. Shares the ShopPopup /
 * FriendsPopup panel skin so the three read as one system.
 *
 * Two ways to get coins: watch a rewarded ad (free, capped per day) or buy a
 * pack with real money through Google Play. The paid section is hidden
 * entirely when billing isn't available — on the web build, and on any device
 * without Play Billing — rather than shown as a dead button.
 */
export function GetCoinsPopup({ onClose, store = coinsStore }: Props) {
  const t = useT()
  const coins = useSyncExternalStore(store.subscribe, store.getState)
  const auth = useSyncExternalStore(authStore.subscribe, authStore.getState)
  const signedIn = auth.status === 'signedIn'

  // How many rewards are left today, so the button can disable at zero rather
  // than playing an ad the server will refuse to pay for.
  useEffect(() => {
    void store.refresh()
  }, [store])

  // Escape closes, matching the app's other dismissable overlays.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const exhausted = coins.remaining === 0
  const disabled = coins.watching || !signedIn || exhausted
  // A pack Play couldn't price is not offered at all: a buy button whose cost
  // we can't state is not something to put in front of a player.
  const sellablePacks = coins.packs.filter((p) => p.priceString !== null)

  return (
    <div
      className="getcoins"
      role="dialog"
      aria-modal="true"
      aria-label={t('getcoins.aria')}
      onClick={onClose}
    >
      <div className="getcoins__panel" onClick={(e) => e.stopPropagation()}>
        <div className="getcoins__head">
          <h2 className="getcoins__title">{t('getcoins.title')}</h2>
          <button
            type="button"
            className="getcoins__close"
            aria-label={t('common.closeAria')}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="getcoins__body">
          <div className="getcoins__card">
            <p className="getcoins__reward">
              <Sprite name="coin" />
              <span className="getcoins__amount">+{REWARDED_AD_COINS}</span>
            </p>
            <p className="getcoins__label">{t('getcoins.watchAdLabel')}</p>

            <button
              type="button"
              className="getcoins__btn"
              disabled={disabled}
              onClick={() => void store.watchAdForCoins()}
            >
              {coins.watching
                ? t('getcoins.loading')
                : exhausted
                  ? t('getcoins.comeBackTomorrow')
                  : t('getcoins.watchAd')}
            </button>

            <p className="getcoins__note">
              {coins.remaining === null
                ? t('getcoins.upToPerDay', { max: REWARDED_ADS_PER_DAY })
                : t('getcoins.leftToday', {
                    remaining: coins.remaining,
                    max: REWARDED_ADS_PER_DAY,
                  })}
            </p>
          </div>

          {coins.billingAvailable && sellablePacks.length > 0 && (
            <>
              <h3 className="getcoins__heading">{t('getcoins.coinPacks')}</h3>
              <ul className="getcoins__packs">
                {sellablePacks.map((pack) => (
                  <li key={pack.productId} className="getcoins__pack">
                    <span className="getcoins__pack-amount">
                      <Sprite name="coin" />
                      {pack.coins}
                    </span>
                    <span className="getcoins__pack-name">{pack.name}</span>
                    <button
                      type="button"
                      className="getcoins__btn getcoins__btn--buy"
                      disabled={coins.purchasing !== null || !signedIn}
                      onClick={() => void store.buyPack(pack.productId)}
                    >
                      {coins.purchasing === pack.productId ? '…' : pack.priceString}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {coins.error && <p className="getcoins__error">{coins.error}</p>}
        </div>
      </div>
    </div>
  )
}
