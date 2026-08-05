import type { Locale } from '../../../../types/i18n'
import type { TranslatedEntry } from '../../../../types/trivia'
import type { TopicPrefix } from '../index'
import { es } from './es'
import { fr } from './fr'
import { de } from './de'
import { it } from './it'

/**
 * One locale's question bank: translated entries per topic, each array in the
 * same order as the English topic file it mirrors.
 *
 * `Partial` on purpose at both levels. A topic (or a whole locale) with no
 * translation falls back to English entry by entry rather than rendering a
 * blank question — a half-shipped translation degrades, it doesn't break.
 * `__tests__/localisedBank.test.ts` is what holds the shipped locales to full
 * coverage; the Partial is the safety net, not the plan.
 */
export type TopicTranslations = Partial<Record<TopicPrefix, TranslatedEntry[]>>

export const TRANSLATIONS: Partial<Record<Locale, TopicTranslations>> = { es, fr, de, it }
