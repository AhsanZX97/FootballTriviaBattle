import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { CryptoKey, JWK, JWTVerifyGetKey, KeyObject } from 'jose'

export interface VerifiedToken {
  userId: string
}

/**
 * Anything jose's `jwtVerify` accepts as a key: a static key, or a resolver
 * function (e.g. the callable `createRemoteJWKSet` returns). Kept as its own
 * union so tests can inject a local key instead of hitting a real JWKS
 * endpoint over the network.
 */
export type JwtVerifyKey = CryptoKey | KeyObject | JWK | Uint8Array | JWTVerifyGetKey

/**
 * Verifies a Supabase-issued access token against the given key/resolver and
 * extracts the user id from the `sub` claim. Never throws: any failure (bad
 * signature, expired, malformed input, a JWKS fetch error) resolves to null
 * so callers can degrade a connection to anonymous instead of rejecting it.
 */
export async function verifySupabaseJwt(
  token: string,
  key: JwtVerifyKey,
): Promise<VerifiedToken | null> {
  try {
    // jose's `jwtVerify` overloads split on whether `key` is a static key or
    // a resolver function; our union covers both so callers get one signature.
    const { payload } = await jwtVerify(token, key as JWTVerifyGetKey)
    const userId = payload.sub
    if (!userId) return null
    return { userId }
  } catch {
    return null
  }
}

/**
 * Builds a verifier bound to a Supabase project's JWKS endpoint. The remote
 * key set is cached (per jose's `createRemoteJWKSet`) across calls to the
 * returned function.
 */
export function createJwtVerifier(supabaseUrl: string): (token: string) => Promise<VerifiedToken | null> {
  const jwks = createRemoteJWKSet(new URL('/auth/v1/.well-known/jwks.json', supabaseUrl))
  return (token: string) => verifySupabaseJwt(token, jwks)
}
