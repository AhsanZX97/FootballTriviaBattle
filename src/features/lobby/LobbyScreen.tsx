import { useSyncExternalStore } from 'react'
import bg from '../../assets/bg.jpg'
import { MAX_NAME_LENGTH } from '../../types/multiplayer'
import { authStore } from '../auth/store'
import { Sprite } from '../../components/Sprite'
import '../menu/IntroScreen.css'
import './LobbyScreen.css'
import { lobbyStore } from './store'
import type { MatchReadySession } from './store'
import { PreMatchCountdown } from './components/PreMatchCountdown'

type Props = {
  onBack: () => void
  /** Fires once the 3-2-1 countdown finishes; the match screen takes over from here. */
  onMatchReady?: (session: MatchReadySession) => void
  /** Opens the friends picker to challenge a friend (owned by App). Only offered
   * when signed in. */
  onFriendlyMatch?: () => void
}

export function LobbyScreen({ onBack, onMatchReady, onFriendlyMatch }: Props) {
  const state = useSyncExternalStore(lobbyStore.subscribe, lobbyStore.getState)
  const auth = useSyncExternalStore(authStore.subscribe, authStore.getState)
  const signedIn = auth.status === 'signedIn'

  function handleCountdownDone() {
    const socket = lobbyStore.getSocket()
    if (socket && state.opponentName !== null && state.youGoFirst !== null) {
      onMatchReady?.({
        socket,
        opponentName: state.opponentName,
        youGoFirst: state.youGoFirst,
        questions: state.questions,
      })
    }
  }

  return (
    <main className="intro lobby">
      <img className="intro__bg" src={bg} alt="" aria-hidden />
      <div className="intro__overlay" aria-hidden />
      <div className="intro__vignette" aria-hidden />
      <div className="intro__scanlines" aria-hidden />
      <div className="intro__content lobby__content">
        <h1 className="lobby__title">1 V 1</h1>

        {state.phase === 'idle' && (
          <>
            {signedIn ? (
              <p className="lobby__username">{auth.username}</p>
            ) : (
              <div className="lobby__name-row">
                <input
                  type="text"
                  className={`lobby__name-input${state.nameError ? ' lobby__name-input--error' : ''}`}
                  value={state.name}
                  onChange={(e) => lobbyStore.setName(e.target.value)}
                  maxLength={MAX_NAME_LENGTH}
                  aria-label="Your name"
                />
                <button
                  type="button"
                  className="lobby__reroll"
                  onClick={() => lobbyStore.rerollName()}
                  aria-label="Randomise name"
                >
                  <Sprite name="dice" />
                </button>
              </div>
            )}
            {state.nameError && (
              <p className="lobby__warning">
                <Sprite name="warning" /> {state.nameError}
              </p>
            )}

            <button type="button" className="lobby__btn" onClick={() => lobbyStore.quickMatch()}>
              QUICK MATCH
            </button>
            <button
              type="button"
              className={`lobby__btn${signedIn ? '' : ' lobby__btn--disabled'}`}
              disabled={!signedIn}
              title={signedIn ? undefined : 'Sign in to challenge friends'}
              onClick={onFriendlyMatch}
            >
              FRIENDLY MATCH
            </button>
            <button type="button" className="lobby__back" onClick={onBack}>
              ◂ BACK
            </button>
          </>
        )}

        {state.phase === 'searching' && (
          <>
            <p className="lobby__status">
              FINDING MATCH<span className="lobby__dots" aria-hidden />
            </p>
            <button type="button" className="lobby__btn" onClick={() => lobbyStore.cancel()}>
              CANCEL
            </button>
          </>
        )}

        {state.phase === 'found' && state.opponentName !== null && state.youGoFirst !== null && (
          <PreMatchCountdown
            opponentName={state.opponentName}
            youGoFirst={state.youGoFirst}
            onDone={handleCountdownDone}
          />
        )}
      </div>
    </main>
  )
}
