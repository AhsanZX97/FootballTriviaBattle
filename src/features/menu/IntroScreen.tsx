import bg from '../../assets/bg.jpg'
import logo from '../../assets/logo.png'
import './IntroScreen.css'

type Props = {
  /** Called when the player picks 1 v CPU. */
  onPlay?: () => void
  /** Called when the player picks 1 v 1, taking them to the multiplayer lobby. */
  onOneVOne?: () => void
}

export function IntroScreen({ onPlay, onOneVOne }: Props) {
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
        <div className="intro__prompt">▸ PRESS START ◂</div>
      </div>
    </main>
  )
}
