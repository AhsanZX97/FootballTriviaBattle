import { describe, expect, it } from 'vitest'
import { LOCALES, type Locale } from '../../../types/i18n'
import { en, type MessageKey, type Messages } from '../messages/en'
import { es } from '../messages/es'
import { fr } from '../messages/fr'
import { de } from '../messages/de'
import { it as itMessages } from '../messages/it'

const CATALOGUES: Record<Locale, Messages> = { en, es, fr, de, it: itMessages }

const keys = Object.keys(en) as MessageKey[]

/** `{name}` placeholders a template expects, as a sorted, de-duplicated list. */
function placeholders(template: string): string[] {
  return [...new Set(Array.from(template.matchAll(/\{(\w+)\}/g), (m) => m[1]))].sort()
}

describe('message catalogues', () => {
  it('ships a catalogue for every locale', () => {
    expect(Object.keys(CATALOGUES).sort()).toEqual([...LOCALES].sort())
  })

  for (const locale of LOCALES) {
    describe(locale, () => {
      it('defines every key in the source catalogue', () => {
        expect(Object.keys(CATALOGUES[locale]).sort()).toEqual([...keys].sort())
      })

      it('has no blank translations', () => {
        const blank = keys.filter((key) => CATALOGUES[locale][key].trim() === '')
        expect(blank).toEqual([])
      })

      // A dropped placeholder renders "WAITING FOR …" with no opponent name —
      // the kind of break that only shows up on one screen in one language.
      it('keeps every placeholder the source message uses', () => {
        const mismatched = keys
          .filter(
            (key) =>
              placeholders(en[key]).join() !== placeholders(CATALOGUES[locale][key]).join(),
          )
          .map((key) => ({
            key,
            expected: placeholders(en[key]),
            actual: placeholders(CATALOGUES[locale][key]),
          }))
        expect(mismatched).toEqual([])
      })
    })
  }

  // Everything but English should actually be translated. A handful of words
  // are legitimately identical across languages, so they're listed explicitly
  // rather than the check being loosened.
  const SHARED_WITH_ENGLISH = new Set<string>([
    'intro.logoAlt',
    'intro.oneVOne',
    'intro.oneVCpu',
    'lobby.title',
    'match.cpu',
    'prematch.vs',
    'stats.vs',
    'friends.online',
    'friends.offline',
    'account.tab.stats',
    'account.title',
    'account.aria',
    'shop.title',
    'shop.aria',
    'intro.shop',
    'auth.password',
    'auth.email',
    'match.lobby',
    'shop.tab.ballSkin',
    'shop.tab.goalSound',
    'match.mainMenu',
    'auth.codeAria',
    'dailyReward.dayShort',
    'stats.winShort',
    'stats.lossShort',
    // identical in French
    'match.questionAria',
  ])

  for (const locale of LOCALES.filter((l) => l !== 'en')) {
    it(`${locale} translates the keys that are not shared with English`, () => {
      const untranslated = keys.filter(
        (key) => !SHARED_WITH_ENGLISH.has(key) && CATALOGUES[locale][key] === en[key],
      )
      expect(untranslated).toEqual([])
    })
  }
})
