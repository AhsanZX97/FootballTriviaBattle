import { useEffect, useRef, useState } from 'react'
import { LOCALES, LOCALE_NAMES, LOCALE_SHORT } from '../../../types/i18n'
import { i18nStore, useLocale, useT } from '../../../services/i18n/store'
import './LanguageControl.css'

type Props = {
  /** Any screen change collapses the picker, matching SoundControl. */
  screen: string
}

/**
 * Language switcher in the TopBar's right slot. Hidden during a match (see
 * TopBar) — mid-match is no time to be reading a language list — so it only
 * appears on the menu-side screens.
 *
 * Like SoundControl, the open list is absolutely positioned so expanding it
 * never grows the top bar's row height and knocks the other icons off their
 * shared centre line. Each language is named in itself (endonym), because
 * someone looking for "Deutsch" can't necessarily read "German".
 */
export function LanguageControl({ screen }: Props) {
  const t = useT()
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => setOpen(false), [screen])

  // Close on a press outside the control.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  // Escape closes, matching the app's other dismissable overlays.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="lang" ref={rootRef}>
      <button
        type="button"
        className="lang__toggle"
        aria-label={t('language.aria')}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="lang__globe" aria-hidden>
          ⊕
        </span>
        <span className="lang__code">{LOCALE_SHORT[locale]}</span>
      </button>

      {open && (
        <div className="lang__panel" role="listbox" aria-label={t('language.title')}>
          {LOCALES.map((option) => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={option === locale}
              className={`lang__option${option === locale ? ' is-active' : ''}`}
              onClick={() => {
                i18nStore.setLocale(option)
                setOpen(false)
              }}
            >
              {LOCALE_NAMES[option]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
