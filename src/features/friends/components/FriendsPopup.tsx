import { useEffect, useState } from 'react'
import { friendsStore } from '../store'
import { useSuppressBanner } from '../../../services/ads'
import { FriendList } from './FriendList'
import { CustomizePanel } from '../../shop/components/CustomizePanel'
import './FriendsPopup.css'

type Tab = 'friends' | 'customize'

type Props = {
  onClose: () => void
  /** Challenge a friend to a live 1v1 (wired to the presence store by the parent). */
  onChallenge?: (friendId: string, username: string) => void
}

/** Modal shell for the player's account: their friends, and the Customize tab
 * for equipping what they own (buying lives in the shop). Refreshes the
 * friend/request lists on open. */
export function FriendsPopup({ onClose, onChallenge }: Props) {
  const [tab, setTab] = useState<Tab>('friends')

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
    <div className="friends-popup" role="dialog" aria-modal="true" aria-label="Friends" onClick={onClose}>
      <div className="friends-popup__panel" onClick={(e) => e.stopPropagation()}>
        <div className="friends-popup__head">
          <h2 className="friends-popup__title">FRIENDS</h2>
          <button
            type="button"
            className="friends-popup__close"
            aria-label="Close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="friends-popup__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'friends'}
            className={`friends-popup__tab${tab === 'friends' ? ' is-active' : ''}`}
            onClick={() => setTab('friends')}
          >
            FRIEND LIST
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'customize'}
            className={`friends-popup__tab${tab === 'customize' ? ' is-active' : ''}`}
            onClick={() => setTab('customize')}
          >
            CUSTOMIZE
          </button>
        </div>

        <div className="friends-popup__body">
          {tab === 'friends' ? <FriendList onChallenge={onChallenge} /> : <CustomizePanel />}
        </div>
      </div>
    </div>
  )
}
