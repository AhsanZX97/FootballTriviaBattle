import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LOCALE_STORAGE_KEY } from '../locale'
import { i18nStore, t } from '../store'

describe('t', () => {
  beforeEach(() => {
    i18nStore.setLocale('en')
  })

  it('returns the message for the active locale', () => {
    expect(t('match.youWin')).toBe('YOU WIN')
    i18nStore.setLocale('de')
    expect(t('match.youWin')).toBe('GEWONNEN')
  })

  it('substitutes named placeholders', () => {
    expect(t('match.waitingFor', { name: 'ALEX' })).toBe('WAITING FOR ALEX…')
  })

  it('substitutes numbers', () => {
    expect(t('match.rematch', { votes: 1 })).toBe('REMATCH (1/2)')
  })

  it('substitutes the same placeholder everywhere it appears', () => {
    i18nStore.setLocale('es')
    expect(t('getcoins.leftToday', { remaining: 2, max: 5 })).toBe('Te quedan 2 de 5 hoy')
  })

  it('leaves a placeholder untouched when no value is supplied', () => {
    expect(t('match.waitingFor')).toBe('WAITING FOR {name}…')
  })
})

describe('i18nStore', () => {
  beforeEach(() => {
    localStorage.clear()
    i18nStore.setLocale('en')
  })

  it('reports the active locale', () => {
    i18nStore.setLocale('fr')
    expect(i18nStore.getLocale()).toBe('fr')
  })

  it('persists the choice so it survives a restart', () => {
    i18nStore.setLocale('it')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('it')
  })

  it('notifies subscribers on a change', () => {
    const listener = vi.fn()
    const unsubscribe = i18nStore.subscribe(listener)
    i18nStore.setLocale('de')
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('does not notify when the locale is set to what it already is', () => {
    i18nStore.setLocale('de')
    const listener = vi.fn()
    const unsubscribe = i18nStore.subscribe(listener)
    i18nStore.setLocale('de')
    expect(listener).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn()
    i18nStore.subscribe(listener)()
    i18nStore.setLocale('es')
    expect(listener).not.toHaveBeenCalled()
  })

  it('keeps the document language in step for assistive tech', () => {
    i18nStore.setLocale('fr')
    expect(document.documentElement.lang).toBe('fr')
  })
})
