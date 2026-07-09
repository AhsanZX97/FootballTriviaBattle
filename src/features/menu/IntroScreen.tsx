import { useSyncExternalStore } from 'react'
import { useBottomBanner } from '../../services/ads'
import bg from '../../assets/bg.jpg'
import logo from '../../assets/logo.png'
import { authStore } from '../auth/store'
import './IntroScreen.css'

type Props = {
  /** Called when the player picks 1 v CPU. */
  onPlay?: () => void
  /** Called when the player picks 1 v 1, taking them to the multiplayer lobby. */
  onOneVOne?: () => void
  /** Called when a signed-out player taps Sign In, taking them to the auth screen. */
  onSignIn?: () => void
  /** Shop is greyed out / non-functional for now — kept as a hook for later. */
  onShop?: () => void
}

export function IntroScreen({ onPlay, onOneVOne, onSignIn, onShop }: Props) {
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
        <img className="intro__logo" src={logo} alt="Football Trivia Battle" />
        <button type="button" className="intro__play" onClick={onOneVOne}>
          <span className="intro__play-label">1 v 1</span>
        </button>
        <button type="button" className="intro__play intro__play--secondary" onClick={onPlay}>
          <span className="intro__play-label">1 v CPU</span>
        </button>

        <button
          type="button"
          className="intro__play intro__play--secondary intro__play--disabled"
          disabled
          onClick={onShop}
          title="Coming soon"
        >
          <span className="intro__play-label">SHOP</span>
        </button>

        {signedIn ? (
          <button
            type="button"
            className="intro__play intro__play--secondary"
            onClick={() => void authStore.signOut()}
          >
            <span className="intro__play-label">SIGN OUT</span>
          </button>
        ) : (
          <button type="button" className="intro__play intro__play--secondary" onClick={onSignIn}>
            <span className="intro__play-label">SIGN IN</span>
          </button>
        )}

        <div className="intro__prompt">▸ PRESS START ◂</div>
      </div>
    </main>
  )
}
