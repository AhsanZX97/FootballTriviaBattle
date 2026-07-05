import { getItem, setItem } from '../storage'

const STORAGE_KEY = 'ftb.recentQuestionIds'

/** Roughly four matches of questions — old enough to feel fresh again. */
export const MAX_RECENT_IDS = 120

/** Ids of recently served questions, oldest first. Never throws. */
export function loadRecentIds(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? new Set(parsed.filter((id) => typeof id === 'string')) : new Set()
  } catch {
    return new Set()
  }
}

/** Append served ids, dropping the oldest beyond MAX_RECENT_IDS. Never throws. */
export function recordRecentIds(ids: string[]): void {
  const merged = new Set([...loadRecentIds(), ...ids])
  const trimmed = [...merged].slice(-MAX_RECENT_IDS)
  setItem(STORAGE_KEY, JSON.stringify(trimmed))
}
