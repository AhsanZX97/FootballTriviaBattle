import { MAX_NAME_LENGTH } from '../../types/multiplayer'

/**
 * Handle generator for anonymous players and bots.
 *
 * The old version was ADJECTIVE + NOUN + NN off two ten-word lists, which read
 * as machine-issued the moment you saw a second one. This builds names from
 * syllables instead — onset + vowel + coda, assembled into a pronounceable
 * stem, then dressed in one of several handle shapes with varied casing. No
 * two parts of the output are drawn from the same small pool, so nothing about
 * a name announces where it came from.
 */

type Rng = () => number

// Consonant inventory, split so a stem never stacks clusters on clusters:
// a syllable that closed on a coda can only be followed by a simple onset.
const SIMPLE_ONSETS = [
  'b', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v',
  'z', 'ch', 'sh', 'th',
] as const

const CLUSTER_ONSETS = [
  'bl', 'br', 'cl', 'cr', 'dr', 'fl', 'fr', 'gl', 'gr', 'kr', 'pr', 'sk',
  'sl', 'sn', 'sp', 'st', 'sw', 'tr', 'tw',
] as const

const SIMPLE_VOWELS = ['a', 'e', 'i', 'o', 'u', 'y'] as const

// One of these per stem at most — two digraphs in a row stop being sayable.
const WIDE_VOWELS = ['ai', 'au', 'ea', 'ee', 'ei', 'ia', 'ie', 'io', 'oa', 'oo', 'ou'] as const

const SIMPLE_CODAS = ['b', 'd', 'g', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'x', 'z'] as const

// Only ever closes a stem, never sits mid-word.
const CLUSTER_CODAS = ['ck', 'ld', 'lt', 'nd', 'ng', 'nk', 'nt', 'rd', 'rk', 'rt', 'sh', 'st', 'th', 'zz'] as const

const PREFIXES = ['the', 'itz', 'im', 'mr', 'lil', 'big', 'el', 'da', 'yo', 'sir'] as const
const SUFFIXES = ['fc', 'hd', 'tv', 'yt', 'xd', 'zz', 'ito', 'inho', 'ski', 'son', 'ez', 'y'] as const

/**
 * Syllable soup will eventually spell something unfortunate. Checked against
 * the letters-only form of a finished name; a hit rerolls the whole thing.
 */
const BLOCKED = [
  'ass', 'cum', 'cok', 'cnt', 'dik', 'dck', 'fag', 'fuk', 'fuc', 'fck',
  'nig', 'pis', 'rap', 'sex', 'sht', 'shi', 'tit', 'twa', 'wank',
]

function pick<T>(items: readonly T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)]
}

interface SyllableOptions {
  /** First syllable of a stem: may open on a bare vowel. */
  first: boolean
  /** Previous syllable closed on a consonant, so this one opens simply. */
  afterCoda: boolean
  /** Last syllable: may take a cluster coda, and usually takes some coda. */
  last: boolean
  /** A wide vowel has already been spent on this stem. */
  wideUsed: boolean
}

function syllable(rng: Rng, opts: SyllableOptions): { text: string; wide: boolean; coda: boolean } {
  let onset: string
  if (opts.first && rng() < 0.15) onset = ''
  else if (opts.afterCoda || rng() < 0.75) onset = pick(SIMPLE_ONSETS, rng)
  else onset = pick(CLUSTER_ONSETS, rng)

  const wide = !opts.wideUsed && rng() < 0.28
  const vowel = wide ? pick(WIDE_VOWELS, rng) : pick(SIMPLE_VOWELS, rng)

  let coda = ''
  if (rng() < (opts.last ? 0.55 : 0.3)) {
    coda = opts.last && rng() < 0.45 ? pick(CLUSTER_CODAS, rng) : pick(SIMPLE_CODAS, rng)
  }

  return { text: onset + vowel + coda, wide, coda: coda !== '' }
}

/**
 * A pronounceable stem of `budget` characters or fewer, at least 4 long.
 * `startConsonant` is set wherever the stem follows something else in a
 * handle, so "da" + "oatri" can't run two vowels into each other.
 */
function stem(rng: Rng, budget: number, startConsonant = false): string {
  for (let attempt = 0; attempt < 16; attempt++) {
    const count = rng() < 0.62 ? 2 : rng() < 0.55 ? 1 : 3
    let out = ''
    let wideUsed = false
    let afterCoda = startConsonant
    for (let i = 0; i < count; i++) {
      const syl = syllable(rng, { first: i === 0 && !startConsonant, afterCoda, last: i === count - 1, wideUsed })
      out += syl.text
      wideUsed = wideUsed || syl.wide
      afterCoda = syl.coda
    }
    if (out.length >= 4 && out.length <= budget) return out
  }
  return pick(SIMPLE_ONSETS, rng) + pick(SIMPLE_VOWELS, rng) + pick(SIMPLE_CODAS, rng) + pick(SIMPLE_VOWELS, rng)
}

function digits(rng: Rng, count: number): string {
  let out = ''
  for (let i = 0; i < count; i++) out += Math.floor(rng() * 10)
  return out
}

/**
 * How a stem gets dressed. Weights keep any one shape from becoming the look
 * of the game — plain names are the most common, and the decorated shapes are
 * spread thin enough that digits and underscores read as personal choices
 * rather than a serial number.
 */
const SHAPES: ReadonlyArray<{ weight: number; parts: (rng: Rng) => string[] }> = [
  // Kavroth
  { weight: 26, parts: (rng) => [stem(rng, 9)] },
  // ZendiMaro — two short stems fused, camel-cased by the caser below
  { weight: 13, parts: (rng) => [stem(rng, 5), stem(rng, 6, true)] },
  // theKavro
  { weight: 10, parts: (rng) => [pick(PREFIXES, rng), stem(rng, 8, true)] },
  // Kavroski
  { weight: 12, parts: (rng) => { const s = pick(SUFFIXES, rng); return [stem(rng, 12 - s.length), s] } },
  // kavro7 / KAVRO92
  { weight: 14, parts: (rng) => [stem(rng, 8), digits(rng, 1 + Math.floor(rng() * 3))] },
  // kav_roth
  { weight: 9, parts: (rng) => [stem(rng, 6), '_', stem(rng, 6, true)] },
  // kavro_09
  { weight: 6, parts: (rng) => [stem(rng, 8), '_', digits(rng, 2)] },
  // xKavrox
  { weight: 5, parts: (rng) => ['x', stem(rng, 8, true), 'x'] },
  // K4VR0TH — light leet, applied after casing
  { weight: 4, parts: (rng) => [stem(rng, 9)] },
]

const TOTAL_WEIGHT = SHAPES.reduce((sum, shape) => sum + shape.weight, 0)

function pickShape(rng: Rng): (typeof SHAPES)[number] {
  let roll = rng() * TOTAL_WEIGHT
  for (const shape of SHAPES) {
    roll -= shape.weight
    if (roll < 0) return shape
  }
  return SHAPES[0]
}

/** Casing is chosen per name, not per part, so a handle looks deliberate. */
function applyCase(parts: string[], rng: Rng): string {
  const roll = rng()
  if (roll < 0.3) return parts.join('')
  if (roll < 0.5) return parts.join('').toUpperCase()
  // Capitalise each alphabetic part: Kavro, KavRoth, TheKavro.
  return parts.map((part) => (/^[a-z]/.test(part) ? part[0].toUpperCase() + part.slice(1) : part)).join('')
}

const LEET: Record<string, string> = { a: '4', e: '3', i: '1', o: '0', s: '5' }

/**
 * One substitution only — a fully leeted handle stops being readable — and
 * never the last vowel standing, which would leave "ronk" as "r0nk".
 */
function leet(name: string, rng: Rng): string {
  const vowels = (name.match(/[aeiouy]/gi) ?? []).length
  const targets: number[] = []
  for (let i = 0; i < name.length; i++) {
    const ch = name[i].toLowerCase()
    if (!LEET[ch]) continue
    if (/[aeiou]/.test(ch) && vowels < 2) continue
    targets.push(i)
  }
  if (targets.length === 0) return name
  const at = targets[Math.floor(rng() * targets.length)]
  return name.slice(0, at) + LEET[name[at].toLowerCase()] + name.slice(at + 1)
}

function build(rng: Rng): string {
  const shape = pickShape(rng)
  const parts = shape.parts(rng)
  let name = applyCase(parts, rng)
  if (shape === SHAPES[SHAPES.length - 1]) name = leet(name, rng)
  return name
}

function acceptable(name: string): boolean {
  if (name.length < 3 || name.length > MAX_NAME_LENGTH) return false
  if (!/^[A-Za-z][A-Za-z0-9_]*[A-Za-z0-9]$/.test(name)) return false
  const letters = name.toLowerCase().replace(/[^a-z]/g, '')
  // A stem's coda meeting a consonant suffix can stack four consonants
  // ("bruck" + "zz"); h and y are left out since they read soft.
  if (/[bcdfgjklmnpqrstvwxz]{4}/.test(letters)) return false
  return !BLOCKED.some((word) => letters.includes(word))
}

/**
 * Randomised default lobby name, e.g. "Kavroth", "zendi_maro", "SKOLTI9".
 * Always [A-Za-z0-9_] and within MAX_NAME_LENGTH.
 */
export function randomName(rng: Rng = Math.random): string {
  for (let attempt = 0; attempt < 24; attempt++) {
    const name = build(rng)
    if (acceptable(name)) return name
  }
  // Vanishingly unlikely; still has to be a name.
  return `Player${digits(rng, 4)}`
}
