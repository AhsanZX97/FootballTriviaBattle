import { describe, expect, it, vi } from 'vitest'
import type { AuthState } from '../../../types/auth'
import { createAuthStore } from '../store'
import { dailyKey } from '../../../services/dailyChallenges'
import { t } from '../../../services/i18n/store'

type Callback = (event: string, session: FakeSession | null) => void | Promise<void>

interface FakeSession {
  access_token: string
  refresh_token: string
  user: { id: string; email: string | null }
}

interface FakeProfile {
  username: string
  coins: number
  /** Present only for accounts minted by the Play Games path. */
  pgs_player_id?: string | null
}

/** Minimal fake matching the subset of the supabase-js client the store
 * uses, following the injection pattern in lobby/store.test.ts. `emit`
 * simulates onAuthStateChange firing (including the initial event supabase-js
 * always sends on subscribe, used here to model boot hydration). */
function createFakeSupabase(profilesById: Record<string, FakeProfile> = {}) {
  let callback: Callback | null = null
  const signInWithPassword = vi.fn(async (_creds: { email: string; password: string }) => ({
    error: null as { message: string } | null,
  }))
  const signUp = vi.fn(
    async (_creds: { email: string; password: string; options?: { data?: { username: string } } }) => ({
      error: null as { message: string } | null,
    }),
  )
  const signOut = vi.fn(async () => ({ error: null as { message: string } | null }))
  const rpc = vi.fn(async (_fn: string, _params?: Record<string, unknown>) => ({
    data: true as unknown,
    error: null as { message: string } | null,
  }))
  const resetPasswordForEmail = vi.fn(async (_email: string) => ({
    error: null as { message: string } | null,
  }))
  const verifyOtp = vi.fn(
    async (_args: { email: string; token: string; type: 'recovery' }) => ({
      error: null as { message: string } | null,
    }),
  )
  const updateUser = vi.fn(async (_args: { password: string }) => ({
    error: null as { message: string } | null,
  }))

  const client = {
    auth: {
      onAuthStateChange: vi.fn((cb: Callback) => {
        callback = cb
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      }),
      signInWithPassword,
      signUp,
      signOut,
      resetPasswordForEmail,
      verifyOtp,
      updateUser,
    },
    from: vi.fn((_table: string) => ({
      select: vi.fn((_cols: string) => ({
        eq: vi.fn((_col: string, value: string) => ({
          single: async () => {
            const profile = profilesById[value]
            return profile
              ? { data: profile, error: null }
              : { data: null, error: { message: 'not found' } }
          },
        })),
      })),
    })),
    rpc,
  }

  return {
    client,
    signInWithPassword,
    signUp,
    signOut,
    rpc,
    resetPasswordForEmail,
    verifyOtp,
    updateUser,
    /** Simulates a real onAuthStateChange firing; awaits the store's handler. */
    emit: async (event: string, session: FakeSession | null) => {
      await callback?.(event, session)
    },
  }
}

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => void data.set(key, value)),
    removeItem: vi.fn((key: string) => void data.delete(key)),
  }
}

const session = (userId: string, email: string): FakeSession => ({
  access_token: 'at',
  refresh_token: 'rt',
  user: { id: userId, email },
})

describe('initial state', () => {
  it('starts loading, seeded with cached coins from storage', () => {
    const fake = createFakeSupabase()
    const storage = fakeStorage({ 'ftb.coins': '7' })
    const store = createAuthStore({ supabaseClient: fake.client as never, storage })

    const state = store.getState()
    expect(state.status).toBe('loading')
    expect(state.coins).toBe(7)
    expect(state.userId).toBeNull()
  })

  it('defaults cached coins to 0 when nothing is cached', () => {
    const fake = createFakeSupabase()
    const store = createAuthStore({ supabaseClient: fake.client as never, storage: fakeStorage() })

    expect(store.getState().coins).toBe(0)
  })
})

describe('hydration on construction', () => {
  it('resolves to signedIn from an existing session', async () => {
    const fake = createFakeSupabase({ u1: { username: 'bob', coins: 5 } })
    const storage = fakeStorage()
    const store = createAuthStore({ supabaseClient: fake.client as never, storage })

    await fake.emit('INITIAL_SESSION', session('u1', 'bob@example.com'))

    expect(store.getState()).toMatchObject({
      status: 'signedIn',
      userId: 'u1',
      username: 'bob',
      email: 'bob@example.com',
      coins: 5,
      error: null,
    } satisfies Partial<AuthState>)
    expect(storage.setItem).toHaveBeenCalledWith('ftb.coins', '5')
  })

  it('resolves to signedOut when there is no existing session', async () => {
    const fake = createFakeSupabase()
    const storage = fakeStorage({ 'ftb.coins': '7' })
    const store = createAuthStore({ supabaseClient: fake.client as never, storage })

    await fake.emit('INITIAL_SESSION', null)

    expect(store.getState()).toMatchObject({
      status: 'signedOut',
      userId: null,
      username: null,
      email: null,
      coins: 0,
      error: null,
    })
  })
})

describe('signUp', () => {
  it('rejects an invalid username before hitting the network', async () => {
    const fake = createFakeSupabase()
    const store = createAuthStore({ supabaseClient: fake.client as never, storage: fakeStorage() })

    await store.signUp('ab', 'bob@example.com', 'password1')

    expect(store.getState().error).toBeTruthy()
    expect(fake.rpc).not.toHaveBeenCalled()
    expect(fake.signUp).not.toHaveBeenCalled()
  })

  it('rejects a short password before hitting the network', async () => {
    const fake = createFakeSupabase()
    const store = createAuthStore({ supabaseClient: fake.client as never, storage: fakeStorage() })

    await store.signUp('bobby', 'bob@example.com', 'short')

    expect(store.getState().error).toBeTruthy()
    expect(fake.rpc).not.toHaveBeenCalled()
  })

  it('signs up happy path: checks availability then calls supabase signUp with the username in metadata', async () => {
    const fake = createFakeSupabase()
    const store = createAuthStore({ supabaseClient: fake.client as never, storage: fakeStorage() })

    await store.signUp('bobby', 'bob@example.com', 'password1')

    expect(fake.rpc).toHaveBeenCalledWith('is_username_available', { p_username: 'bobby' })
    expect(fake.signUp).toHaveBeenCalledWith({
      email: 'bob@example.com',
      password: 'password1',
      options: { data: { username: 'bobby' } },
    })
    expect(store.getState().error).toBeNull()
  })

  it('sets an error and does not call supabase signUp when the username is taken', async () => {
    const fake = createFakeSupabase()
    fake.rpc.mockResolvedValue({ data: false, error: null })
    const store = createAuthStore({ supabaseClient: fake.client as never, storage: fakeStorage() })

    await store.signUp('bobby', 'bob@example.com', 'password1')

    expect(store.getState().error).toBe('Username already taken.')
    expect(fake.signUp).not.toHaveBeenCalled()
  })

  it('translates a recognised supabase signUp failure instead of leaking its text', async () => {
    const fake = createFakeSupabase()
    fake.signUp.mockResolvedValue({ error: { message: 'User already registered' } })
    const store = createAuthStore({ supabaseClient: fake.client as never, storage: fakeStorage() })

    await store.signUp('bobby', 'bob@example.com', 'password1')

    expect(store.getState().error).toBe(t('auth.error.emailTaken'))
  })

  it('falls back to a generic message for an unrecognised supabase failure', async () => {
    const fake = createFakeSupabase()
    fake.signUp.mockResolvedValue({ error: { message: 'kaboom 0x8007' } })
    const store = createAuthStore({ supabaseClient: fake.client as never, storage: fakeStorage() })

    await store.signUp('bobby', 'bob@example.com', 'password1')

    expect(store.getState().error).toBe(t('auth.error.generic'))
  })
})

describe('signIn', () => {
  it('signs in with email directly via signInWithPassword when the input looks like an email', async () => {
    const fake = createFakeSupabase()
    const store = createAuthStore({ supabaseClient: fake.client as never, storage: fakeStorage() })

    await store.signIn('bob@example.com', 'password1')

    expect(fake.signInWithPassword).toHaveBeenCalledWith({ email: 'bob@example.com', password: 'password1' })
  })

  it('sets a readable error on bad email/password credentials', async () => {
    const fake = createFakeSupabase()
    fake.signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } })
    const store = createAuthStore({ supabaseClient: fake.client as never, storage: fakeStorage() })

    await store.signIn('bob@example.com', 'wrong-password')

    expect(store.getState().error).toBe('Invalid username/email or password.')
    expect(store.getState().status).toBe('loading')
  })

  it('uses the loginWithUsername helper when the input is not an email, and surfaces its error', async () => {
    const fake = createFakeSupabase()
    const loginWithUsernameFn = vi.fn(async () => ({ error: 'invalid_credentials' }))
    const store = createAuthStore({
      supabaseClient: fake.client as never,
      storage: fakeStorage(),
      loginWithUsernameFn,
    })

    await store.signIn('bobby', 'wrong-password')

    expect(loginWithUsernameFn).toHaveBeenCalledWith('bobby', 'wrong-password')
    expect(fake.signInWithPassword).not.toHaveBeenCalled()
    expect(store.getState().error).toBe('Invalid username/email or password.')
  })

  it('clears any previous error on a fresh attempt', async () => {
    const fake = createFakeSupabase()
    fake.signInWithPassword.mockResolvedValueOnce({ error: { message: 'bad' } })
    const store = createAuthStore({ supabaseClient: fake.client as never, storage: fakeStorage() })
    await store.signIn('bob@example.com', 'wrong')
    expect(store.getState().error).toBeTruthy()

    fake.signInWithPassword.mockResolvedValueOnce({ error: null })
    await store.signIn('bob@example.com', 'password1')

    expect(store.getState().error).toBeNull()
  })
})

describe('signOut', () => {
  it('clears coins and the cached storage once signed out fires', async () => {
    const fake = createFakeSupabase({ u1: { username: 'bob', coins: 9 } })
    const storage = fakeStorage()
    const store = createAuthStore({ supabaseClient: fake.client as never, storage })
    await fake.emit('SIGNED_IN', session('u1', 'bob@example.com'))
    expect(store.getState().coins).toBe(9)

    await store.signOut()
    await fake.emit('SIGNED_OUT', null)

    expect(fake.signOut).toHaveBeenCalled()
    expect(store.getState()).toMatchObject({
      status: 'signedOut',
      userId: null,
      username: null,
      email: null,
      coins: 0,
      error: null,
    })
    expect(storage.removeItem).toHaveBeenCalledWith('ftb.coins')
  })
})

describe('requestPasswordReset', () => {
  it('rejects an invalid email before hitting the network', async () => {
    const fake = createFakeSupabase()
    const store = createAuthStore({ supabaseClient: fake.client as never, storage: fakeStorage() })

    await store.requestPasswordReset('not-an-email')

    expect(store.getState().error).toBeTruthy()
    expect(fake.resetPasswordForEmail).not.toHaveBeenCalled()
  })

  it('sends the reset email for a valid address', async () => {
    const fake = createFakeSupabase()
    const store = createAuthStore({ supabaseClient: fake.client as never, storage: fakeStorage() })

    await store.requestPasswordReset('bob@example.com')

    expect(fake.resetPasswordForEmail).toHaveBeenCalledWith('bob@example.com')
    expect(store.getState().error).toBeNull()
  })

  it('surfaces an error from supabase', async () => {
    const fake = createFakeSupabase()
    fake.resetPasswordForEmail.mockResolvedValue({ error: { message: 'rate limited' } })
    const store = createAuthStore({ supabaseClient: fake.client as never, storage: fakeStorage() })

    await store.requestPasswordReset('bob@example.com')

    expect(store.getState().error).toBe(t('auth.error.rateLimited'))
  })
})

describe('confirmPasswordReset', () => {
  it('rejects a malformed code before hitting the network', async () => {
    const fake = createFakeSupabase()
    const store = createAuthStore({ supabaseClient: fake.client as never, storage: fakeStorage() })

    await store.confirmPasswordReset('bob@example.com', '12', 'newpassword1')

    expect(store.getState().error).toBeTruthy()
    expect(fake.verifyOtp).not.toHaveBeenCalled()
  })

  it('rejects a short new password before hitting the network', async () => {
    const fake = createFakeSupabase()
    const store = createAuthStore({ supabaseClient: fake.client as never, storage: fakeStorage() })

    await store.confirmPasswordReset('bob@example.com', '12345678', 'short')

    expect(store.getState().error).toBeTruthy()
    expect(fake.verifyOtp).not.toHaveBeenCalled()
  })

  it('sets an error and never calls updateUser when the code is invalid', async () => {
    const fake = createFakeSupabase()
    fake.verifyOtp.mockResolvedValue({ error: { message: 'expired' } })
    const store = createAuthStore({ supabaseClient: fake.client as never, storage: fakeStorage() })

    await store.confirmPasswordReset('bob@example.com', '12345678', 'newpassword1')

    expect(store.getState().error).toBe('Invalid or expired code.')
    expect(fake.updateUser).not.toHaveBeenCalled()
  })

  it('verifies the code then updates the password on the happy path', async () => {
    const fake = createFakeSupabase()
    const store = createAuthStore({ supabaseClient: fake.client as never, storage: fakeStorage() })

    await store.confirmPasswordReset('bob@example.com', '12345678', 'newpassword1')

    expect(fake.verifyOtp).toHaveBeenCalledWith({
      email: 'bob@example.com',
      token: '12345678',
      type: 'recovery',
    })
    expect(fake.updateUser).toHaveBeenCalledWith({ password: 'newpassword1' })
    expect(store.getState().error).toBeNull()
  })

  it('surfaces an error when updateUser fails after a valid code', async () => {
    const fake = createFakeSupabase()
    fake.updateUser.mockResolvedValue({ error: { message: 'weak password' } })
    const store = createAuthStore({ supabaseClient: fake.client as never, storage: fakeStorage() })

    await store.confirmPasswordReset('bob@example.com', '12345678', 'newpassword1')

    expect(store.getState().error).toBe(t('auth.error.passwordLength'))
  })
})

describe('clearError', () => {
  it('resets the error field only', async () => {
    const fake = createFakeSupabase()
    fake.signInWithPassword.mockResolvedValue({ error: { message: 'bad' } })
    const store = createAuthStore({ supabaseClient: fake.client as never, storage: fakeStorage() })
    await store.signIn('bob@example.com', 'wrong')
    expect(store.getState().error).toBeTruthy()

    store.clearError()

    expect(store.getState().error).toBeNull()
  })
})

describe('applyCoinsUpdate', () => {
  it('updates state and writes through to the cache', () => {
    const fake = createFakeSupabase()
    const storage = fakeStorage()
    const store = createAuthStore({ supabaseClient: fake.client as never, storage })

    store.applyCoinsUpdate(42)

    expect(store.getState().coins).toBe(42)
    expect(storage.setItem).toHaveBeenCalledWith('ftb.coins', '42')
  })
})

describe('claimDailyReward', () => {
  async function signedInStore() {
    const fake = createFakeSupabase({ u1: { username: 'bob', coins: 5 } })
    const storage = fakeStorage()
    const store = createAuthStore({ supabaseClient: fake.client as never, storage })
    await fake.emit('INITIAL_SESSION', session('u1', 'bob@example.com'))
    return { fake, storage, store }
  }

  it('returns null when signed out', async () => {
    const fake = createFakeSupabase()
    const store = createAuthStore({ supabaseClient: fake.client as never, storage: fakeStorage() })
    await fake.emit('INITIAL_SESSION', null)

    expect(await store.claimDailyReward()).toBeNull()
    expect(fake.rpc).not.toHaveBeenCalled()
  })

  it('banks the reward and updates coins + streak on success', async () => {
    const { fake, storage, store } = await signedInStore()
    fake.rpc.mockResolvedValueOnce({
      data: { already_claimed: false, coins: 25, streak: 7, reward: 20 },
      error: null,
    })

    const result = await store.claimDailyReward()

    expect(fake.rpc).toHaveBeenCalledWith('claim_daily_reward')
    expect(result).toEqual({ alreadyClaimed: false, coins: 25, streak: 7, reward: 20 })
    expect(store.getState()).toMatchObject({
      coins: 25,
      dailyRewardStreak: 7,
      lastDailyRewardDate: dailyKey(),
    })
    expect(storage.setItem).toHaveBeenCalledWith('ftb.coins', '25')
  })

  it('reports an already-claimed day without granting coins', async () => {
    const { fake, store } = await signedInStore()
    fake.rpc.mockResolvedValueOnce({
      data: { already_claimed: true, coins: 5, streak: 3, reward: 0 },
      error: null,
    })

    const result = await store.claimDailyReward()

    expect(result).toEqual({ alreadyClaimed: true, coins: 5, streak: 3, reward: 0 })
    expect(store.getState().coins).toBe(5)
  })

  it('returns null when the RPC errors', async () => {
    const { fake, store } = await signedInStore()
    fake.rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })

    expect(await store.claimDailyReward()).toBeNull()
    expect(store.getState().coins).toBe(5)
  })
})

describe('subscribe', () => {
  it('notifies listeners on state changes', async () => {
    const fake = createFakeSupabase({ u1: { username: 'bob', coins: 1 } })
    const store = createAuthStore({ supabaseClient: fake.client as never, storage: fakeStorage() })
    const listener = vi.fn()
    store.subscribe(listener)

    await fake.emit('SIGNED_IN', session('u1', 'bob@example.com'))

    expect(listener).toHaveBeenCalled()
  })

  it('stops notifying after unsubscribe', () => {
    const fake = createFakeSupabase()
    const store = createAuthStore({ supabaseClient: fake.client as never, storage: fakeStorage() })
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    unsubscribe()

    store.applyCoinsUpdate(3)

    expect(listener).not.toHaveBeenCalled()
  })
})

describe('renameUsername', () => {
  async function signedInStore() {
    const fake = createFakeSupabase({ u1: { username: 'bob', coins: 5 } })
    const store = createAuthStore({ supabaseClient: fake.client as never, storage: fakeStorage() })
    await fake.emit('INITIAL_SESSION', session('u1', 'bob@example.com'))
    return { fake, store }
  }

  it('updates the username when the RPC accepts the rename', async () => {
    const { fake, store } = await signedInStore()
    fake.rpc.mockResolvedValueOnce({ data: { ok: true, username: 'ahsan' }, error: null })

    expect(await store.renameUsername('ahsan')).toBe(true)

    expect(fake.rpc).toHaveBeenCalledWith('rename_username', { p_username: 'ahsan' })
    expect(store.getState()).toMatchObject({ username: 'ahsan', error: null })
  })

  it('trims surrounding whitespace before validating', async () => {
    const { fake, store } = await signedInStore()
    fake.rpc.mockResolvedValueOnce({ data: { ok: true, username: 'ahsan' }, error: null })

    await store.renameUsername('  ahsan  ')

    expect(fake.rpc).toHaveBeenCalledWith('rename_username', { p_username: 'ahsan' })
  })

  it('rejects an invalid username before hitting the network', async () => {
    const { fake, store } = await signedInStore()

    expect(await store.renameUsername('no spaces')).toBe(false)

    expect(fake.rpc).not.toHaveBeenCalled()
    expect(store.getState()).toMatchObject({ username: 'bob', error: t('auth.error.usernameFormat') })
  })

  it('reports a taken username and leaves the current one in place', async () => {
    const { fake, store } = await signedInStore()
    fake.rpc.mockResolvedValueOnce({ data: { ok: false, error: 'taken' }, error: null })

    expect(await store.renameUsername('someoneelse')).toBe(false)

    expect(store.getState()).toMatchObject({ username: 'bob', error: t('auth.error.usernameTaken') })
  })

  it('reports a generic failure when the RPC errors', async () => {
    const { fake, store } = await signedInStore()
    fake.rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })

    expect(await store.renameUsername('ahsan')).toBe(false)

    expect(store.getState().username).toBe('bob')
    expect(store.getState().error).toBeTruthy()
  })

  it('is a no-op when the name is unchanged', async () => {
    const { fake, store } = await signedInStore()

    expect(await store.renameUsername('bob')).toBe(true)

    expect(fake.rpc).not.toHaveBeenCalled()
  })

  it('does nothing when signed out', async () => {
    const fake = createFakeSupabase()
    const store = createAuthStore({ supabaseClient: fake.client as never, storage: fakeStorage() })
    await fake.emit('INITIAL_SESSION', null)

    expect(await store.renameUsername('ahsan')).toBe(false)
    expect(fake.rpc).not.toHaveBeenCalled()
  })
})

describe('silent Play Games sign-in', () => {
  function pgsDeps(authCode: string | null) {
    return {
      playGamesAuthCodeFn: vi.fn(async () => authCode),
      signInWithPlayGamesFn: vi.fn(async (_code: string) => ({ error: null as string | null })),
    }
  }

  it('redeems the auth code when boot finds no existing session', async () => {
    const fake = createFakeSupabase()
    const deps = pgsDeps('code-1')
    createAuthStore({ supabaseClient: fake.client as never, storage: fakeStorage(), ...deps })

    await fake.emit('INITIAL_SESSION', null)

    expect(deps.playGamesAuthCodeFn).toHaveBeenCalled()
    expect(deps.signInWithPlayGamesFn).toHaveBeenCalledWith('code-1')
  })

  it('does nothing when Play Games has no code to give', async () => {
    const fake = createFakeSupabase()
    const deps = pgsDeps(null)
    const store = createAuthStore({ supabaseClient: fake.client as never, storage: fakeStorage(), ...deps })

    await fake.emit('INITIAL_SESSION', null)

    expect(deps.signInWithPlayGamesFn).not.toHaveBeenCalled()
    expect(store.getState().status).toBe('signedOut')
  })

  it('never runs when boot restores a session', async () => {
    const fake = createFakeSupabase({ u1: { username: 'bob', coins: 5 } })
    const deps = pgsDeps('code-1')
    createAuthStore({ supabaseClient: fake.client as never, storage: fakeStorage(), ...deps })

    await fake.emit('INITIAL_SESSION', session('u1', 'bob@example.com'))

    expect(deps.playGamesAuthCodeFn).not.toHaveBeenCalled()
  })

  it('does not sign a player straight back in after they sign out', async () => {
    const fake = createFakeSupabase()
    const deps = pgsDeps('code-1')
    createAuthStore({ supabaseClient: fake.client as never, storage: fakeStorage(), ...deps })

    await fake.emit('INITIAL_SESSION', null)
    await fake.emit('SIGNED_OUT', null)

    expect(deps.signInWithPlayGamesFn).toHaveBeenCalledTimes(1)
  })

  it('leaves the player signed out when the backend rejects the code', async () => {
    const fake = createFakeSupabase()
    const deps = pgsDeps('code-1')
    deps.signInWithPlayGamesFn.mockResolvedValue({ error: 'pgs_rejected' })
    const store = createAuthStore({ supabaseClient: fake.client as never, storage: fakeStorage(), ...deps })

    await fake.emit('INITIAL_SESSION', null)

    expect(store.getState().status).toBe('signedOut')
    // Silent and optional: a failure is not something to interrupt with.
    expect(store.getState().error).toBeNull()
  })
})

describe('isPlayGamesAccount', () => {
  it('is true for a profile carrying a Play Games player id', async () => {
    const fake = createFakeSupabase({ u1: { username: 'bob', coins: 5, pgs_player_id: 'a_123' } })
    const store = createAuthStore({ supabaseClient: fake.client as never, storage: fakeStorage() })

    await fake.emit('INITIAL_SESSION', session('u1', 'pgs-a_123@players.invalid'))

    expect(store.getState().isPlayGamesAccount).toBe(true)
  })

  it('is false for an ordinary email account', async () => {
    const fake = createFakeSupabase({ u1: { username: 'bob', coins: 5 } })
    const store = createAuthStore({ supabaseClient: fake.client as never, storage: fakeStorage() })

    await fake.emit('INITIAL_SESSION', session('u1', 'bob@example.com'))

    expect(store.getState().isPlayGamesAccount).toBe(false)
  })

  it('resets on sign-out', async () => {
    const fake = createFakeSupabase({ u1: { username: 'bob', coins: 5, pgs_player_id: 'a_123' } })
    const store = createAuthStore({ supabaseClient: fake.client as never, storage: fakeStorage() })
    await fake.emit('INITIAL_SESSION', session('u1', 'pgs-a_123@players.invalid'))

    await fake.emit('SIGNED_OUT', null)

    expect(store.getState().isPlayGamesAccount).toBe(false)
  })
})
