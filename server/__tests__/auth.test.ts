// @vitest-environment node
//
// Forced to the 'node' environment (vs this project's default jsdom) because
// jose's webapi build relies on the real Node WebCrypto global (crypto.subtle)
// to sign/verify keys; jsdom's crypto shim doesn't implement SubtleCrypto.
import { describe, expect, it, vi } from 'vitest'
import { SignJWT, exportJWK, generateKeyPair } from 'jose'
import type { CryptoKey } from 'jose'
import { createJwtVerifier, verifySupabaseJwt } from '../auth'

async function signToken(
  privateKey: CryptoKey,
  options: { sub?: string; kid?: string; exp?: number } = {},
): Promise<string> {
  let jwt = new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: options.kid }).setIssuedAt()
  if (options.sub) jwt = jwt.setSubject(options.sub)
  jwt = jwt.setExpirationTime(options.exp ?? Math.floor(Date.now() / 1000) + 3600)
  return jwt.sign(privateKey)
}

describe('verifySupabaseJwt', () => {
  it("resolves the userId from a validly signed token's sub claim", async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256')
    const token = await signToken(privateKey, { sub: 'user-123' })
    await expect(verifySupabaseJwt(token, publicKey)).resolves.toEqual({ userId: 'user-123' })
  })

  it('returns null when the signature does not match the key', async () => {
    const { privateKey } = await generateKeyPair('RS256')
    const { publicKey: wrongPublicKey } = await generateKeyPair('RS256')
    const token = await signToken(privateKey, { sub: 'user-123' })
    await expect(verifySupabaseJwt(token, wrongPublicKey)).resolves.toBeNull()
  })

  it('returns null for an expired token', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256')
    const token = await signToken(privateKey, {
      sub: 'user-123',
      exp: Math.floor(Date.now() / 1000) - 10,
    })
    await expect(verifySupabaseJwt(token, publicKey)).resolves.toBeNull()
  })

  it('returns null for a malformed token instead of throwing', async () => {
    const { publicKey } = await generateKeyPair('RS256')
    await expect(verifySupabaseJwt('not-a-jwt', publicKey)).resolves.toBeNull()
  })

  it('returns null when the token has no sub claim', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256')
    const token = await signToken(privateKey, {})
    await expect(verifySupabaseJwt(token, publicKey)).resolves.toBeNull()
  })
})

describe('createJwtVerifier', () => {
  it('builds a verifier that resolves keys from the Supabase JWKS endpoint', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256')
    const jwk = await exportJWK(publicKey)
    jwk.kid = 'test-kid'
    jwk.alg = 'RS256'
    jwk.use = 'sig'
    const token = await signToken(privateKey, { sub: 'user-456', kid: 'test-kid' })

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ keys: [jwk] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    try {
      const verify = createJwtVerifier('https://example.supabase.co')
      await expect(verify(token)).resolves.toEqual({ userId: 'user-456' })
      expect(fetchMock).toHaveBeenCalled()
      const calledUrl = String(fetchMock.mock.calls[0]![0])
      expect(calledUrl).toContain('/auth/v1/.well-known/jwks.json')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('resolves null (not a throw) when the JWKS endpoint is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network down')),
    )
    try {
      const { privateKey } = await generateKeyPair('RS256')
      const token = await signToken(privateKey, { sub: 'user-789' })
      const verify = createJwtVerifier('https://example.supabase.co')
      await expect(verify(token)).resolves.toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
