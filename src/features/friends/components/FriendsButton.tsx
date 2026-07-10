import { useState, useSyncExternalStore } from 'react'
import { authStore } from '../../auth/store'
import { friendsStore } from '../store'
import { FriendsPopup } from './FriendsPopup'
import profileIcon from '../../../assets/sprites/profile.png'
import './FriendsButton.css'

/** Profile icon in the top bar. Only shown when signed in (friends need an
 * account). Carries a red badge with the count of incoming friend requests and
 * opens the friends popup. App-level float, mirroring CoinCounter. */
export function FriendsButton() {
  const auth = useSyncExternalStore(authStore.subscribe, authStore.getState)
  const friends = useSyncExternalStore(friendsStore.subscribe, friendsStore.getState)
  const [open, setOpen] = useState(false)

  if (auth.status !== 'signedIn') return null

  const pending = friends.incoming.length

  return (
    <>
      <button
        type="button"
        className="friends-btn"
        aria-label={pending > 0 ? `Friends (${pending} pending requests)` : 'Friends'}
        onClick={() => setOpen(true)}
      >
        <img className="friends-btn__img" src={profileIcon} alt="" />
        {pending > 0 && (
          <span className="friends-btn__badge" aria-hidden>
            {pending > 9 ? '9+' : pending}
          </span>
        )}
      </button>
      {open && <FriendsPopup onClose={() => setOpen(false)} />}
    </>
  )
}
