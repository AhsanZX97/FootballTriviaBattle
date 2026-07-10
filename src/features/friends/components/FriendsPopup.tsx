import { useEffect, useState } from 'react'
import { friendsStore } from '../store'
import { FriendList } from './FriendList'
import './FriendsPopup.css'

type Tab = 'friends' | 'customize'

type Props = {
  onClose: () => void
}

/** Modal shell for the friends system. Friend List tab is live; Customize is a
 * disabled placeholder for later. Refreshes the friend/request lists on open. */
export function FriendsPopup({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>('friends')

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
            aria-selected={false}
            className="friends-popup__tab friends-popup__tab--disabled"
            disabled
            title="Coming soon"
          >
            CUSTOMIZE
          </button>
        </div>

        <div className="friends-popup__body">{tab === 'friends' && <FriendList />}</div>
      </div>
    </div>
  )
}
