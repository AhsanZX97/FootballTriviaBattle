import { useState } from 'react'
import { MAX_NAME_LENGTH } from '../../../types/multiplayer'
import { Sprite } from '../../../components/Sprite'
import { useT } from '../../../services/i18n/store'

type Props = {
  username: string
  /** Rename failure text owned by the auth store (already translated). */
  error: string | null
  /** Resolves true once the new name is live; false leaves `error` set. */
  onRename: (next: string) => Promise<boolean>
  onClearError: () => void
}

/**
 * The signed-in half of the lobby's name row: the account's username, plus an
 * inline editor behind a RENAME button. Signed-out players get the free-text
 * input + dice reroll instead — a username is account state, so changing it
 * has to round-trip the server and can fail (taken, bad format), which the
 * throwaway guest name never does.
 */
export function UsernameRow({ username, error, onRename, onClearError }: Props) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(username)
  const [saving, setSaving] = useState(false)

  function startEditing() {
    onClearError()
    setDraft(username)
    setEditing(true)
  }

  function stopEditing() {
    onClearError()
    setEditing(false)
  }

  async function save() {
    if (saving) return
    setSaving(true)
    const renamed = await onRename(draft)
    setSaving(false)
    // A failure keeps the editor open so the rejected draft stays visible
    // next to the reason it was rejected.
    if (renamed) setEditing(false)
  }

  if (!editing) {
    return (
      <div className="lobby__name-row">
        <p className="lobby__username">{username}</p>
        <button type="button" className="lobby__rename" onClick={startEditing}>
          {t('lobby.rename')}
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="lobby__name-row">
        <input
          type="text"
          className={`lobby__name-input${error ? ' lobby__name-input--error' : ''}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save()
            if (e.key === 'Escape') stopEditing()
          }}
          maxLength={MAX_NAME_LENGTH}
          autoFocus
          aria-label={t('lobby.newUsername')}
        />
        <button type="button" className="lobby__rename" disabled={saving} onClick={() => void save()}>
          {t('lobby.saveName')}
        </button>
      </div>
      {error && (
        <p className="lobby__warning">
          <Sprite name="warning" /> {error}
        </p>
      )}
      <button type="button" className="lobby__rename-cancel" onClick={stopEditing}>
        {t('common.cancel')}
      </button>
    </>
  )
}
