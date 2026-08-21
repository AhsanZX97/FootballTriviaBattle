import { useState, useSyncExternalStore } from 'react'
import { authStore } from '../../auth/store'
import { friendsStore } from '../store'
import { presenceStore } from '../presenceStore'
import { FriendsPopup } from './FriendsPopup'
import profileIcon from '../../../assets/sprites/profile.png'
import './FriendsButton.css'
import { useT } from '../../../services/i18n/store'

/** Profile icon in the TopBar's left slot. Opens the account popup, which a
 * signed-out player needs just as much as a signed-in one: it is where the
 * daily reward, the challenges and the Customize tab live, and all three work
 * without an account. Only the friends and stats tabs inside it ask for one.
 *
 * The request badge is signed-in-only for the obvious reason — there are no
 * friend requests without an account to receive them. */
export function FriendsButton() {
  const t = useT()
  const auth = useSyncExternalStore(authStore.subscribe, authStore.getState)
  const friends = useSyncExternalStore(friendsStore.subscribe, friendsStore.getState)
  const [open, setOpen] = useState(false)

  const pending = auth.status === 'signedIn' ? friends.incoming.length : 0

  return (
    <>
      <button
        type="button"
        className="friends-btn"
        aria-label={
          pending > 0 ? t('friends.buttonPending', { count: pending }) : t('friends.button')
        }
        onClick={() => setOpen(true)}
      >
        <img className="friends-btn__img" src={profileIcon} alt="" />
        {pending > 0 && (
          <span className="friends-btn__badge" aria-hidden>
            {pending > 9 ? '9+' : pending}
          </span>
        )}
      </button>
      {open && (
        <FriendsPopup
          onClose={() => setOpen(false)}
          onChallenge={(friendId, username) => {
            void presenceStore.challenge(friendId, username)
            setOpen(false)
          }}
        />
      )}
    </>
  )
}
