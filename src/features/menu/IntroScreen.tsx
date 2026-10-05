import { useSyncExternalStore } from 'react'
import { useBottomBanner } from '../../services/ads'
import bg from '../../assets/bg.jpg'
import logo from '../../assets/logo.png'
import coinSprite from '../../assets/sprites/coin.png'
import playVsHuman from '../../assets/levels/play-vs-human.png'
import padlock from '../../assets/levels/padlock.png'
import { LEVELS, NEXT_LEVEL } from '../../game/levels/manifest'
import { levelProgress } from '../../game/levels/progress'
import { authStore } from '../auth/store'
import { levelStore } from '../levels/store'
import { PrizeBadge } from '../levels/PrizeBadge'
import { prizeArt } from '../levels/prizeArt'
import './IntroScreen.css'
import '../levels/LevelScreen.css'
import { useT } from '../../services/i18n/store'

type Props = {
  /** Called when the player picks Play vs Human, taking them to the multiplayer lobby. */
  onPlayNow?: () => void
  /** Opens a level's card grid. */
  onOpenLevel?: (level: number) => void
  /** Called when a signed-out player taps Sign In, taking them to the auth screen. */
  onSignIn?: () => void
  /** Opens the shop popup (skins, balls, goal sounds). */
  onShop?: () => void
  /** Dev-only animation sandbox; the button is compiled out of release builds. */
  onTestMode?: () => void
}

export function IntroScreen({ onPlayNow, onOpenLevel, onSignIn, onShop, onTestMode }: Props) {
  const t = useT()
  useBottomBanner(true) // ad banner sits under the menu for as long as it's open
  const auth = useSyncExternalStore(authStore.subscribe, authStore.getState)
  const levels = useSyncExternalStore(levelStore.subscribe, levelStore.getState)
  const signedIn = auth.status === 'signedIn'

  return (
    <main className="intro">
      <img className="intro__bg" src={bg} alt="" aria-hidden />
      <div className="intro__overlay" aria-hidden />
      <div className="intro__vignette" aria-hidden />
      <div className="intro__scanlines" aria-hidden />
      <div className="intro__content home__content">
        <div className="home__header">
          <button type="button" className="intro__play intro__play--secondary home__chip" onClick={onShop}>
            <span className="intro__play-label">{t('intro.shop')}</span>
          </button>

          {__TEST_MODE__ && onTestMode && (
            <button type="button" className="intro__play intro__play--secondary home__chip" onClick={onTestMode}>
              <span className="intro__play-label">TEST MODE</span>
            </button>
          )}

          {/* A Play Games account is deliberately given no way out: it has no
              password and an unroutable email, so signing out would strand the
              player on a sign-in screen that cannot let them back in. Play Games
              signs them in again on the next cold start regardless. */}
          {signedIn && auth.isPlayGamesAccount ? null : signedIn ? (
            <button
              type="button"
              className="intro__play intro__play--secondary home__chip"
              onClick={() => void authStore.signOut()}
            >
              <span className="intro__play-label">{t('intro.signOut')}</span>
            </button>
          ) : (
            <button type="button" className="intro__play intro__play--secondary home__chip" onClick={onSignIn}>
              <span className="intro__play-label">{t('intro.signIn')}</span>
            </button>
          )}
        </div>

        <img className="intro__logo home__logo" src={logo} alt={t('intro.logoAlt')} />

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

        <button type="button" className="pixel-card" onClick={onPlayNow}>
          <img className="pixel-card__art" src={playVsHuman} alt="" aria-hidden />
          <span className="pixel-card__text">
            <span className="pixel-card__title">{t('home.playVsHuman')}</span>
            <span className="pixel-card__sub">{t('home.playVsHumanSub')}</span>
          </span>
          <span className="pixel-card__arrow" aria-hidden>
            ▸
          </span>
        </button>

        <section className="home__levels" aria-label="Levels">
          {LEVELS.map((def) => {
            const { solved, total } = levelProgress(def, levels.solved)
            const claimed = levels.prizes.includes(def.level)
            const prize = `Prize: ${prizeArt(def.prize).name}${claimed ? ', claimed' : ''}`
            return (
              <button
                key={def.level}
                type="button"
                className={`pixel-card${solved === total ? ' pixel-card--done' : ''}`}
                aria-label={`${t('levels.levelAria', { level: def.level, solved, total })}. ${prize}`}
                onClick={() => onOpenLevel?.(def.level)}
              >
                <span className="pixel-card__plate" aria-hidden>
                  <span className="pixel-card__plate-label">LV</span>
                  <span className="pixel-card__plate-num">{def.level}</span>
                </span>
                <span className="pixel-card__text" aria-hidden>
                  <span className="pixel-card__title">{def.title}</span>
                  <span className="pixel-card__bar">
                    <progress className="pixel-progress" max={total} value={solved} />
                    <span className="pixel-card__count">
                      {solved}/{total}
                    </span>
                  </span>
                </span>
                <PrizeBadge prize={def.prize} claimed={claimed} decorative />
              </button>
            )
          })}

          {/* Not playable yet: its questions aren't seeded server-side, so
              even reaching the solve count only says it's on its way. */}
          <div className="pixel-card pixel-card--locked" role="group" aria-label={`Level ${NEXT_LEVEL.level}, locked`}>
            <span className="pixel-card__plate" aria-hidden>
              <span className="pixel-card__plate-label">LV</span>
              <span className="pixel-card__plate-num">{NEXT_LEVEL.level}</span>
            </span>
            <span className="pixel-card__text">
              <span className="pixel-card__title">{NEXT_LEVEL.title}</span>
              <span className="pixel-card__sub">
                {Object.keys(levels.solved).length >= NEXT_LEVEL.unlockAt
                  ? 'COMING SOON'
                  : `SOLVE ${NEXT_LEVEL.unlockAt} TO UNLOCK`}
              </span>
            </span>
            <span className="level-prize" aria-hidden>
              <img className="level-prize__art" src={padlock} alt="" />
            </span>
          </div>
        </section>
      </div>
    </main>
  )
}
