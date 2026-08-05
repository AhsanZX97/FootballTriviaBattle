import { DEFAULT_LOCALE, isLocale, type Locale } from '../../types/i18n'
import { getItem, setItem } from '../storage'

export const LOCALE_STORAGE_KEY = 'ftb.locale'

/**
 * Narrow a BCP-47 tag ("es-419", "de-AT", "pt_BR") to a locale we ship.
 * Only the primary subtag matters — we don't ship regional variants — so
 * `fr-CA` and `fr` both land on French. Unknown languages fall back to `en`.
 */
export function localeFromTag(tag: string | null | undefined): Locale | null {
  if (!tag) return null
  const primary = tag.replace('_', '-').split('-')[0]?.toLowerCase()
  return isLocale(primary) ? primary : null
}

/**
 * The phone's language, as the first entry in `navigator.languages` we can
 * serve. Walks the full list rather than only `navigator.language` so a device
 * set to [ga, fr, en] gets French instead of dropping straight to English.
 */
export function detectLocale(
  nav: { language?: string; languages?: readonly string[] } | undefined = typeof navigator ===
  'undefined'
    ? undefined
    : navigator,
): Locale {
  const tags = [...(nav?.languages ?? []), nav?.language].filter(Boolean) as string[]
  for (const tag of tags) {
    const locale = localeFromTag(tag)
    if (locale) return locale
  }
  return DEFAULT_LOCALE
}

/** A previously chosen locale, or null when the player has never picked one. */
export function loadStoredLocale(): Locale | null {
  const stored = getItem(LOCALE_STORAGE_KEY)
  return isLocale(stored) ? stored : null
}

export function storeLocale(locale: Locale): void {
  setItem(LOCALE_STORAGE_KEY, locale)
}

/**
 * The locale to boot with: an explicit past choice wins, otherwise follow the
 * device. An explicit choice is never overwritten by the device language, so a
 * player who picks English on a German phone keeps English.
 */
export function initialLocale(): Locale {
  return loadStoredLocale() ?? detectLocale()
}
