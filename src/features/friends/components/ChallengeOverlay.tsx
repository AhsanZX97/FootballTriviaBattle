import { useEffect, useSyncExternalStore } from 'react'
import { presenceStore } from '../presenceStore'
import './ChallengeOverlay.css'

const NOTICE_TIMEOUT_MS = 4000

/** App-level overlay for the live challenge flow: a modal when a friend
 * challenges you (accept/decline), a "waiting…" banner while your own invite is
 * out, and a transient notice when one fails. Reads the presence store; the
 * actual match hand-off is wired in App via presenceStore.onMatchReady. */
export function ChallengeOverlay() {
  const state = useSyncExternalStore(presenceStore.subscribe, presenceStore.getState)
  const { incoming, outgoing, notice } = state

  // auto-dismiss the transient notice
  useEffect(() => {
    if (!notice) return
    const id = setTimeout(() => presenceStore.clearNotice(), NOTICE_TIMEOUT_MS)
    return () => clearTimeout(id)
  }, [notice])

  return (
    <>
      {incoming && (
        <div className="challenge" role="dialog" aria-modal="true" aria-label="Incoming challenge">
          <div className="challenge__panel">
            <p className="challenge__headline">
              <span className="challenge__ball" aria-hidden>
                ⚽
              </span>
              <strong>{incoming.fromName}</strong> challenges you!
            </p>
            <div className="challenge__actions">
              <button
                type="button"
                className="challenge__btn challenge__btn--accept"
                onClick={() => presenceStore.acceptIncoming()}
              >
                ACCEPT
              </button>
              <button
                type="button"
                className="challenge__btn challenge__btn--decline"
                onClick={() => presenceStore.declineIncoming()}
              >
                DECLINE
              </button>
            </div>
          </div>
        </div>
      )}

      {outgoing && !incoming && (
        <div className="challenge-banner" role="status">
          <span className="challenge-banner__text">Waiting for {outgoing.friendName}…</span>
          <button
            type="button"
            className="challenge-banner__cancel"
            onClick={() => presenceStore.cancelOutgoing()}
          >
            CANCEL
          </button>
        </div>
      )}

      {notice && (
        <div className="challenge-notice" role="status" onClick={() => presenceStore.clearNotice()}>
          {notice}
        </div>
      )}
    </>
  )
}
