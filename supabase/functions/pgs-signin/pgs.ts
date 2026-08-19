// Pure logic for turning a Play Games player into an account, kept free of
// Deno, network and Supabase imports so it can be unit-tested with the
// project's normal vitest run (see __tests__/pgs.test.ts, and the same split
// in verify-coin-purchase/verify.ts). index.ts owns all the I/O.

/** Mirrors the profiles.username CHECK constraint from 0001_accounts.sql. */
export const USERNAME_MIN = 3
export const USERNAME_MAX = 16

/** The subset of Google's token endpoint response we read. */
export interface GoogleTokenResponse {
  access_token?: unknown
}

/** The subset of `games/v1/players/me` we read. */
export interface GamesPlayer {
  playerId?: unknown
  displayName?: unknown
}

export interface PlayGamesIdentity {
  playerId: string
  /** The gamer tag. Empty when Google omits it — callers fall back. */
  displayName: string
}

export function parseAccessToken(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const token = (body as GoogleTokenResponse).access_token
  return typeof token === 'string' && token.length > 0 ? token : null
}

/**
 * A player with no id is unusable — we would have nothing stable to key the
 * account on — so that is the one field this insists on.
 */
export function parsePlayer(body: unknown): PlayGamesIdentity | null {
  if (!body || typeof body !== 'object') return null
  const { playerId, displayName } = body as GamesPlayer
  if (typeof playerId !== 'string' || playerId.length === 0) return null
  return {
    playerId,
    displayName: typeof displayName === 'string' ? displayName : '',
  }
}

/**
 * Squeezes a gamer tag into the shape `profiles.username` accepts: letters,
 * digits and underscore, 3-16 characters. Spaces and punctuation become
 * underscores rather than vanishing, so "Big Ahsan" reads as "Big_Ahsan"
 * instead of "BigAhsan". Returns '' when nothing usable survives (a
 * fully non-Latin tag, which is common) — callers fall back to a generated
 * name rather than shipping a mangled one.
 */
export function slugUsername(displayName: string): string {
  const slug = displayName
    .normalize('NFKD')
    // Strip combining marks so accented Latin degrades to its base letter
    // (José -> Jose) instead of being replaced with underscores.
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, USERNAME_MAX)
    // A trailing underscore can reappear after the slice.
    .replace(/_+$/g, '')
  return slug.length >= USERNAME_MIN ? slug : ''
}

/**
 * Joins a disambiguating suffix onto a base name with an underscore, trimming
 * the base so the result still fits in 16 characters. The suffix is never
 * truncated — it is the part that makes the name unique.
 */
export function withSuffix(base: string, suffix: string): string {
  // -1 leaves room for the separator itself.
  const room = Math.max(0, USERNAME_MAX - suffix.length - 1)
  const trimmed = base.slice(0, room).replace(/_+$/g, '')
  if (trimmed.length === 0) return `Player_${suffix}`.slice(0, USERNAME_MAX)
  return `${trimmed}_${suffix}`
}

/**
 * The names to try, in order, for a brand-new PGS account: the gamer tag
 * first, then the same tag with each supplied suffix. `suffixes` is passed in
 * (rather than generated here) so tests stay deterministic and index.ts owns
 * the randomness.
 *
 * With no usable gamer tag every candidate is a generated `Player_xxxx`, which
 * is also the shape a player is most likely to want to change — hence the
 * rename button in the lobby.
 */
export function usernameCandidates(displayName: string, suffixes: readonly string[]): string[] {
  const base = slugUsername(displayName)
  if (!base) return suffixes.map((suffix) => withSuffix('Player', suffix))
  return [base, ...suffixes.map((suffix) => withSuffix(base, suffix))]
}

/**
 * The address on the auth user. GoTrue requires an email; PGS never provides
 * one. `.invalid` is reserved by RFC 2606 precisely so it can never resolve or
 * collide with a real domain, which keeps these users unreachable by password
 * reset and unable to squat someone's real address.
 */
export function syntheticEmail(playerId: string): string {
  return `pgs-${playerId}@players.invalid`
}
