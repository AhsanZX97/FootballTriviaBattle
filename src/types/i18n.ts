/** Languages the game ships. `en` is the source locale every other one falls back to. */
export const LOCALES = ['en', 'es', 'fr', 'de', 'it'] as const

export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'en'

/** Endonyms — a language picker should name each language in that language. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
}

/** Two-letter code shown inside the compact top-bar globe button. */
export const LOCALE_SHORT: Record<Locale, string> = {
  en: 'EN',
  es: 'ES',
  fr: 'FR',
  de: 'DE',
  it: 'IT',
}

export function isLocale(value: string | null | undefined): value is Locale {
  return value != null && (LOCALES as readonly string[]).includes(value)
}

/** Values interpolated into a message via `{name}` placeholders. */
export type MessageParams = Record<string, string | number>
