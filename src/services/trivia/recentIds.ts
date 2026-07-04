const STORAGE_KEY = 'ftb.recentQuestionIds'

/** Roughly four matches of questions — old enough to feel fresh again. */
export const MAX_RECENT_IDS = 120

function storage(): Storage | null {
  // The server imports the trivia service too; Node has no localStorage.
  return typeof localStorage === 'undefined' ? null : localStorage
}

/** Ids of recently served questions, oldest first. Never throws. */
export function loadRecentIds(): Set<string> {
  const store = storage()
  if (!store) return new Set()
  try {
    const parsed: unknown = JSON.parse(store.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? new Set(parsed.filter((id) => typeof id === 'string')) : new Set()
  } catch {
    return new Set()
  }
}

/** Append served ids, dropping the oldest beyond MAX_RECENT_IDS. Never throws. */
export function recordRecentIds(ids: string[]): void {
  const store = storage()
  if (!store) return
  const merged = new Set([...loadRecentIds(), ...ids])
  const trimmed = [...merged].slice(-MAX_RECENT_IDS)
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    // Quota or privacy-mode failure — repeat avoidance is best-effort.
  }
}
