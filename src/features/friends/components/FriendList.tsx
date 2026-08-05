import { useEffect, useState, useSyncExternalStore } from 'react'
import { friendsStore } from '../store'
import { presenceStore } from '../presenceStore'
import type { Relationship } from '../../../types/friends'
import './FriendList.css'
import { t, useT } from '../../../services/i18n/store'

type Props = {
  /** Phase 3 wires this to directed matchmaking; until then the Challenge
   * buttons render disabled. */
  onChallenge?: (friendId: string, username: string) => void
}

/** Label + disabled-state for a searched user's Add button, from the caller's
 * current relationship with them. */
function addButtonFor(rel: Relationship): { label: string; disabled: boolean } {
  switch (rel) {
    case 'friends':
      return { label: t('friends.friends'), disabled: true }
    case 'outgoing':
      return { label: t('friends.sent'), disabled: true }
    case 'incoming':
      return { label: t('friends.accept'), disabled: false }
    default:
      return { label: t('friends.add'), disabled: false }
  }
}

export function FriendList({ onChallenge }: Props) {
  const t = useT()
  const state = useSyncExternalStore(friendsStore.subscribe, friendsStore.getState)
  const presence = useSyncExternalStore(presenceStore.subscribe, presenceStore.getState)
  const [query, setQuery] = useState('')

  // Debounce the search so we don't fire a request per keystroke.
  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      friendsStore.clearSearch()
      return
    }
    const id = setTimeout(() => void friendsStore.search(trimmed), 350)
    return () => clearTimeout(id)
  }, [query])

  const onAddOrAccept = (rel: Relationship, id: string, username: string) => {
    if (rel === 'incoming') void friendsStore.accept(id)
    else void friendsStore.sendRequest(username, id)
  }

  const showingSearch = query.trim().length > 0
  const hasNothing =
    state.friends.length === 0 && state.incoming.length === 0 && state.outgoing.length === 0

  return (
    <div className="friend-list">
      <div className="friend-list__search">
        <input
          className="friend-list__search-input"
          type="text"
          placeholder={t('friends.search')}
          aria-label={t('friends.searchAria')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>

      {state.actionError && <p className="friend-list__error">{state.actionError}</p>}

      {showingSearch ? (
        <section className="friend-list__section">
          {state.searching && <p className="friend-list__hint">{t('friends.searching')}</p>}
          {!state.searching && state.searchResults.length === 0 && (
            <p className="friend-list__hint">{t('friends.noPlayers')}</p>
          )}
          <ul className="friend-list__items">
            {state.searchResults.map((u) => {
              const btn = addButtonFor(u.relationship)
              return (
                <li key={u.id} className="friend-list__row">
                  <span className="friend-list__name">{u.username}</span>
                  <button
                    type="button"
                    className="friend-list__action"
                    disabled={btn.disabled}
                    onClick={() => onAddOrAccept(u.relationship, u.id, u.username)}
                  >
                    {btn.label}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ) : (
        <>
          {state.incoming.length > 0 && (
            <section className="friend-list__section">
              <h3 className="friend-list__heading">{t('friends.requests')}</h3>
              <ul className="friend-list__items">
                {state.incoming.map((r) => (
                  <li key={r.otherId} className="friend-list__row">
                    <span className="friend-list__name">{r.username}</span>
                    <span className="friend-list__row-actions">
                      <button
                        type="button"
                        className="friend-list__icon friend-list__icon--accept"
                        aria-label={t('friends.acceptAria', { name: r.username })}
                        onClick={() => void friendsStore.accept(r.otherId)}
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        className="friend-list__icon friend-list__icon--decline"
                        aria-label={t('friends.declineAria', { name: r.username })}
                        onClick={() => void friendsStore.decline(r.otherId)}
                      >
                        ✕
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="friend-list__section">
            <h3 className="friend-list__heading">{t('friends.friends')}</h3>
            {state.friends.length === 0 ? (
              <p className="friend-list__hint">
                {hasNothing ? t('friends.noFriendsHint') : t('friends.noFriends')}
              </p>
            ) : (
              <ul className="friend-list__items">
                {state.friends.map((f) => {
                  const online = presence.onlineFriends.includes(f.id)
                  return (
                  <li key={f.id} className="friend-list__row">
                    <span className="friend-list__identity">
                      <span
                        className={`friend-list__dot${online ? ' friend-list__dot--online' : ''}`}
                        role="img"
                        aria-label={online ? t('friends.online') : t('friends.offline')}
                      />
                      <span className="friend-list__name">{f.username}</span>
                    </span>
                    <span className="friend-list__row-actions">
                      <button
                        type="button"
                        className="friend-list__action"
                        disabled={!onChallenge || !online}
                        title={
                          !onChallenge
                            ? t('friends.comingSoon')
                            : online
                              ? undefined
                              : t('friends.isOffline', { name: f.username })
                        }
                        onClick={() => onChallenge?.(f.id, f.username)}
                      >
                        {t('friends.challenge')}
                      </button>
                      <button
                        type="button"
                        className="friend-list__icon friend-list__icon--decline"
                        aria-label={t('friends.removeAria', { name: f.username })}
                        onClick={() => void friendsStore.remove(f.id)}
                      >
                        ✕
                      </button>
                    </span>
                  </li>
                  )
                })}
              </ul>
            )}
          </section>

          {state.outgoing.length > 0 && (
            <section className="friend-list__section">
              <h3 className="friend-list__heading">{t('friends.sent')}</h3>
              <ul className="friend-list__items">
                {state.outgoing.map((r) => (
                  <li key={r.otherId} className="friend-list__row">
                    <span className="friend-list__name">{r.username}</span>
                    <button
                      type="button"
                      className="friend-list__icon friend-list__icon--decline"
                      aria-label={t('friends.cancelRequestAria', { name: r.username })}
                      onClick={() => void friendsStore.remove(r.otherId)}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}
