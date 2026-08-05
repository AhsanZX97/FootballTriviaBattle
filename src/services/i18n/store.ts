import { useSyncExternalStore } from 'react'
import type { Locale, MessageParams } from '../../types/i18n'
import { DEFAULT_LOCALE } from '../../types/i18n'
import { initialLocale, storeLocale } from './locale'
import { en, type MessageKey, type Messages } from './messages/en'
import { es } from './messages/es'
import { fr } from './messages/fr'
import { de } from './messages/de'
import { it } from './messages/it'

const CATALOGUES: Record<Locale, Messages> = { en, es, fr, de, it }

type Listener = () => void

let locale: Locale = initialLocale()
const listeners = new Set<Listener>()

function emit() {
  for (const listener of listeners) listener()
}

/** Keeps assistive tech and the browser's own hyphenation in step with the UI. */
function syncDocumentLang(next: Locale) {
  if (typeof document !== 'undefined') document.documentElement.lang = next
}

syncDocumentLang(locale)

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const getLocale = () => locale

/** Persisted, so the choice survives a restart and outranks the device language. */
function setLocale(next: Locale): void {
  if (next === locale) return
  locale = next
  storeLocale(next)
  syncDocumentLang(next)
  emit()
}

export const i18nStore = { subscribe, getLocale, setLocale }

function interpolate(template: string, params?: MessageParams): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  )
}

/**
 * Translate a key in the active locale, falling back to English for any key a
 * catalogue is missing (the types make that unreachable, but a stale persisted
 * build shouldn't render a raw key at the player).
 *
 * Module-level rather than hook-only so stores and services — which produce
 * user-facing error text outside React — can use it too. Those call sites read
 * the locale at call time, so a language switch is picked up on the next error.
 */
export function t(key: MessageKey, params?: MessageParams): string {
  const template = CATALOGUES[locale]?.[key] ?? CATALOGUES[DEFAULT_LOCALE][key] ?? key
  return interpolate(template, params)
}

/**
 * `t` bound to the current locale for React. Subscribing is what re-renders the
 * component on a language switch — the returned function is the same module
 * `t`, so it stays referentially stable across renders.
 */
export function useT(): typeof t {
  useSyncExternalStore(subscribe, getLocale, () => DEFAULT_LOCALE)
  return t
}

/** The active locale, for components that render the language itself. */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale, () => DEFAULT_LOCALE)
}
