import { beforeEach, describe, expect, it } from 'vitest'
import { detectLocale, initialLocale, localeFromTag, LOCALE_STORAGE_KEY, storeLocale } from '../locale'

describe('localeFromTag', () => {
  it('accepts a bare language code we ship', () => {
    expect(localeFromTag('fr')).toBe('fr')
  })

  it('drops the region so regional variants land on the base language', () => {
    expect(localeFromTag('de-AT')).toBe('de')
    expect(localeFromTag('es-419')).toBe('es')
  })

  it('accepts underscore-separated tags', () => {
    expect(localeFromTag('it_IT')).toBe('it')
  })

  it('is case insensitive', () => {
    expect(localeFromTag('ES-es')).toBe('es')
  })

  it('returns null for a language we do not ship', () => {
    expect(localeFromTag('pt-BR')).toBeNull()
    expect(localeFromTag('ja')).toBeNull()
  })

  it('returns null for empty and missing tags', () => {
    expect(localeFromTag('')).toBeNull()
    expect(localeFromTag(null)).toBeNull()
    expect(localeFromTag(undefined)).toBeNull()
  })
})

describe('detectLocale', () => {
  it('uses the phone language when we ship it', () => {
    expect(detectLocale({ language: 'de-DE', languages: ['de-DE'] })).toBe('de')
  })

  it('walks past languages we do not ship to the first we do', () => {
    expect(detectLocale({ language: 'ga', languages: ['ga', 'pt', 'fr-CA', 'en'] })).toBe('fr')
  })

  it('falls back to English when nothing in the list is supported', () => {
    expect(detectLocale({ language: 'ja', languages: ['ja', 'ko'] })).toBe('en')
  })

  it('falls back to English when the navigator is unavailable', () => {
    expect(detectLocale(undefined)).toBe('en')
  })

  it('reads `language` when `languages` is absent', () => {
    expect(detectLocale({ language: 'it' })).toBe('it')
  })
})

describe('initialLocale', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('follows the device when the player has never picked a language', () => {
    expect(initialLocale()).toBe(detectLocale())
  })

  it('prefers a stored choice over the device language', () => {
    storeLocale('it')
    expect(initialLocale()).toBe('it')
  })

  it('ignores a stored value that is not a locale we ship', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'klingon')
    expect(initialLocale()).toBe(detectLocale())
  })
})
