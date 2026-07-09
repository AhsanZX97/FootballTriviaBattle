import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAuthStorageAdapter, loginWithUsername, supabase } from '../supabase'

describe('createAuthStorageAdapter', () => {
  function fakeStorage() {
    return {
      getItem: vi.fn((_key: string) => 'stored-value'),
      setItem: vi.fn((_key: string, _value: string) => {}),
      removeItem: vi.fn((_key: string) => {}),
    }
  }

  it('delegates getItem to the injected storage', () => {
    const storage = fakeStorage()
    const adapter = createAuthStorageAdapter(storage)

    expect(adapter.getItem('sb-session')).toBe('stored-value')
    expect(storage.getItem).toHaveBeenCalledWith('sb-session')
  })

  it('delegates setItem to the injected storage', () => {
    const storage = fakeStorage()
    const adapter = createAuthStorageAdapter(storage)

    adapter.setItem('sb-session', '{"token":"abc"}')
    expect(storage.setItem).toHaveBeenCalledWith('sb-session', '{"token":"abc"}')
  })

  it('delegates removeItem to the injected storage', () => {
    const storage = fakeStorage()
    const adapter = createAuthStorageAdapter(storage)

    adapter.removeItem('sb-session')
    expect(storage.removeItem).toHaveBeenCalledWith('sb-session')
  })

  it('defaults to this repo storage.ts seam when constructed with no args', () => {
    // storage.ts falls back to a no-op when localStorage is unavailable, but in
    // jsdom it's present — round-trip through the real seam to prove the
    // default wiring (not just the injected fake) works.
    const adapter = createAuthStorageAdapter()
    adapter.setItem('ftb.test-adapter', 'hello')
    expect(adapter.getItem('ftb.test-adapter')).toBe('hello')
    adapter.removeItem('ftb.test-adapter')
    expect(adapter.getItem('ftb.test-adapter')).toBeNull()
  })
})

describe('loginWithUsername', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('sets the session and returns no error on a successful login', async () => {
    const session = { access_token: 'at', refresh_token: 'rt' }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ session }), { status: 200 })),
    )
    const setSession = vi.spyOn(supabase.auth, 'setSession').mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    } as never)

    const result = await loginWithUsername('bob', 'password1')

    expect(result).toEqual({ error: null })
    expect(setSession).toHaveBeenCalledWith({ access_token: 'at', refresh_token: 'rt' })
  })

  it('returns an error and never calls setSession when the server rejects the credentials', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'invalid_credentials' }), { status: 401 })),
    )
    const setSession = vi.spyOn(supabase.auth, 'setSession')

    const result = await loginWithUsername('bob', 'wrong-password')

    expect(result.error).toBeTruthy()
    expect(setSession).not.toHaveBeenCalled()
  })

  it('never throws and returns an error when the network request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down')
      }),
    )

    const result = await loginWithUsername('bob', 'password1')

    expect(result.error).toBeTruthy()
  })
})
