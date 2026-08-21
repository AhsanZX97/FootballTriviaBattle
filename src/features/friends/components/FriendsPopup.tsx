import { useEffect, useState, useSyncExternalStore } from 'react'
import { friendsStore } from '../store'
import { authStore } from '../../auth/store'
import { useSuppressBanner } from '../../../services/ads'
import { FriendList } from './FriendList'
import { CustomizePanel } from '../../shop/components/CustomizePanel'
import { StatsPanel } from '../../stats/components/StatsPanel'
import { ChallengesPanel } from '../../challenges/components/ChallengesPanel'
import './FriendsPopup.css'
import { useT } from '../../../services/i18n/store'

type Tab = 'daily' | 'friends' | 'stats' | 'customize'

type Props = {
  onClose: () => void
  /** Challenge a friend to a live 1v1 (wired to the presence store by the parent). */
  onChallenge?: (friendId: string, username: string) => void
}

/** Modal shell for the player's account: their friends, and the Customize tab
 * for equipping what they own (buying lives in the shop). Refreshes the
 * friend/request lists on open. */
export function FriendsPopup({ onClose, onChallenge }: Props) {
  const t = useT()
  const auth = useSyncExternalStore(authStore.subscribe, authStore.getState)
  const signedIn = auth.status === 'signedIn'
  // Friends is the one tab that cannot work at all without an account, so a
  // signed-out player opens on Daily — something they can actually use.
  const [tab, setTab] = useState<Tab>(signedIn ? 'friends' : 'daily')

  // Hide the native bottom banner while open: the username search field opens
  // the Android keyboard, which otherwise shoves the banner up over the popup.
  useSuppressBanner()

  useEffect(() => {
    void friendsStore.refresh()
  }, [])

  // Escape closes, matching the app's other dismissable overlays.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="friends-popup" role="dialog" aria-modal="true" aria-label={t('account.aria')} onClick={onClose}>
      <div className="friends-popup__panel" onClick={(e) => e.stopPropagation()}>
        <div className="friends-popup__head">
          <h2 className="friends-popup__title">{t('account.title')}</h2>
          <button
            type="button"
            className="friends-popup__close"
            aria-label={t('common.closeAria')}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="friends-popup__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'daily'}
            className={`friends-popup__tab${tab === 'daily' ? ' is-active' : ''}`}
            onClick={() => setTab('daily')}
          >
            {t('account.tab.daily')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'friends'}
            className={`friends-popup__tab${tab === 'friends' ? ' is-active' : ''}`}
            onClick={() => setTab('friends')}
          >
            {t('account.tab.friends')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'stats'}
            className={`friends-popup__tab${tab === 'stats' ? ' is-active' : ''}`}
            onClick={() => setTab('stats')}
          >
            {t('account.tab.stats')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'customize'}
            className={`friends-popup__tab${tab === 'customize' ? ' is-active' : ''}`}
            onClick={() => setTab('customize')}
          >
            {t('account.tab.custom')}
          </button>
        </div>

        <div className="friends-popup__body">
          {tab === 'daily' && <ChallengesPanel />}
          {/* Friends and stats are account-only: one needs someone to befriend
              you, the other needs somewhere durable to keep a record. Both say
              so rather than rendering an empty shell. */}
          {tab === 'friends' &&
            (signedIn ? (
              <FriendList onChallenge={onChallenge} />
            ) : (
              <p className="friends-popup__signin">{t('friends.signInNote')}</p>
            ))}
          {tab === 'stats' &&
            (signedIn ? (
              <StatsPanel />
            ) : (
              <p className="friends-popup__signin">{t('stats.signInNote')}</p>
            ))}
          {tab === 'customize' && <CustomizePanel />}
        </div>
      </div>
    </div>
  )
}
