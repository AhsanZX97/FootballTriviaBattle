import { useSyncExternalStore } from 'react'
import { useBottomBanner } from '../../services/ads'
import bg from '../../assets/bg.jpg'
import logo from '../../assets/logo.png'
import { authStore } from '../auth/store'
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
  const signedIn = auth.status === 'signedIn'

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

        <div className="intro__prompt">▸ {t('intro.pressStart')} ◂</div>
      </div>
    </main>
  )
}
