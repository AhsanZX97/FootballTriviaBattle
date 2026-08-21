import { useSyncExternalStore } from 'react'
import { useBottomBanner } from '../../services/ads'
import bg from '../../assets/bg.jpg'
import logo from '../../assets/logo.png'
import coinSprite from '../../assets/sprites/coin.png'
import { authStore } from '../auth/store'
import { localProgressStore } from '../progress/store'
import './IntroScreen.css'
import { useT } from '../../services/i18n/store'

type Props = {
  /** Called when the player picks Play Now, taking them to the multiplayer lobby. */
  onPlayNow?: () => void
  /** Called when a signed-out player taps Sign In, taking them to the auth screen. */
  onSignIn?: () => void
  /** Opens the shop popup (skins, balls, goal sounds). */
  onShop?: () => void
}

export function IntroScreen({ onPlayNow, onSignIn, onShop }: Props) {
  const t = useT()
  useBottomBanner(true) // ad banner sits under the menu for as long as it's open
  const auth = useSyncExternalStore(authStore.subscribe, authStore.getState)
  const local = useSyncExternalStore(localProgressStore.subscribe, localProgressStore.getState)
  const signedIn = auth.status === 'signedIn'
  // Only once the session is settled: flashing "sign in to keep your coins" at
  // a player who is about to be signed in by Play Games would be a lie.
  const showLocalCoins = auth.status === 'signedOut' && local.coins > 0

  return (
    <main className="intro">
      <img className="intro__bg" src={bg} alt="" aria-hidden />
      <div className="intro__overlay" aria-hidden />
      <div className="intro__vignette" aria-hidden />
      <div className="intro__scanlines" aria-hidden />
      <div className="intro__content">
        <img className="intro__logo" src={logo} alt={t('intro.logoAlt')} />
        <button type="button" className="intro__play" onClick={onPlayNow}>
          <span className="intro__play-label">{t('intro.playNow')}</span>
        </button>

        <button type="button" className="intro__play intro__play--secondary" onClick={onShop}>
          <span className="intro__play-label">{t('intro.shop')}</span>
        </button>

{/* A Play Games account is deliberately given no way out: it has no
            password and an unroutable email, so signing out would strand the
            player on a sign-in screen that cannot let them back in. Play Games
            signs them in again on the next cold start regardless. */}
        {signedIn && auth.isPlayGamesAccount ? null : signedIn ? (
          <button
            type="button"
            className="intro__play intro__play--secondary"
            onClick={() => void authStore.signOut()}
          >
            <span className="intro__play-label">{t('intro.signOut')}</span>
          </button>
        ) : (
          <button type="button" className="intro__play intro__play--secondary" onClick={onSignIn}>
            <span className="intro__play-label">{t('intro.signIn')}</span>
          </button>
        )}

        {/* The conversion prompt: a pre-account player's coins are real and
            visible, and this is the only place that says what keeps them. */}
        {showLocalCoins && (
          <div className="intro__local-coins">
            <span className="intro__local-coins-total">
              <img className="intro__local-coins-icon" src={coinSprite} alt="" aria-hidden />
              {t('intro.localCoins', { coins: local.coins })}
            </span>
            <span className="intro__local-coins-cta">{t('intro.localCoinsCta')}</span>
          </div>
        )}

        {/* The payoff, shown once after the claim lands. Tapping dismisses it. */}
        {signedIn && auth.welcomeCoins !== null && (
          <button
            type="button"
            className="intro__claimed"
            onClick={() => authStore.clearWelcomeNotice()}
          >
            <img className="intro__local-coins-icon" src={coinSprite} alt="" aria-hidden />
            {t('intro.claimed', { coins: auth.welcomeCoins })}
          </button>
        )}

        <div className="intro__prompt">▸ {t('intro.pressStart')} ◂</div>
      </div>
    </main>
  )
}
