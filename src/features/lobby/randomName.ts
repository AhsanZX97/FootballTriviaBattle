// Word lengths are capped so ADJECTIVE + NOUN + " NN" always fits MAX_NAME_LENGTH (16).
const ADJECTIVES = ['TURBO', 'SWIFT', 'LUCKY', 'ROGUE', 'SOLAR', 'RAPID', 'NIFTY', 'BOLD', 'ZESTY', 'FIERY']
const NOUNS = ['KEEPER', 'WINGER', 'BALLER', 'ACE', 'BOOT', 'CONE', 'SPUR', 'BOSS', 'BLOCK', 'DASH']

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

/** Randomised default lobby name, e.g. "TURBO KEEPER 42". Always within MAX_NAME_LENGTH. */
export function randomName(): string {
  const digits = String(Math.floor(Math.random() * 100)).padStart(2, '0')
  return `${pick(ADJECTIVES)} ${pick(NOUNS)} ${digits}`
}
