import type { AuthState } from '../../types/auth'
import { getItem, removeItem, setItem } from '../../services/storage'
import { loginWithUsername, supabase } from '../../services/supabase'

export interface AuthStore {
  getState(): AuthState
  subscribe(listener: () => void): () => void
  signIn(usernameOrEmail: string, password: string): Promise<void>
  signUp(username: string, email: string, password: string): Promise<void>
  signOut(): Promise<void>
  clearError(): void
  /** Applied when a coin balance update arrives out-of-band (1v1 `coinsAwarded`
   * message, or a CPU-win RPC response) without a full profile refetch. */
  applyCoinsUpdate(balance: number): void
  /** Emails an 8-digit recovery code (OTP-code flow — no deep link/redirect
   * needed, unlike Supabase's default reset-link email). Never reveals
   * whether the address has an account: a failure here is a real send
   * failure (bad address format, rate limit), not "no such user". */
  requestPasswordReset(email: string): Promise<void>
  /** Verifies the emailed code and sets the new password. Success leaves the
   * caller signed in (verifyOtp establishes a session), picked up by the
   * same onAuthStateChange subscription signIn/signUp rely on. */
  confirmPasswordReset(email: string, code: string, newPassword: string): Promise<void>
}

const COINS_CACHE_KEY = 'ftb.coins'
const USERNAME_PATTERN = /^[A-Za-z0-9_]+$/

/** Session shape this store needs — a structural subset of supabase-js's `Session`. */
interface AuthSession {
  access_token: string
  refresh_token: string
  user: { id: string; email: string | null }
}

interface ProfileRow {
  username: string
  coins: number
}

type AuthChangeCallback = (event: string, session: AuthSession | null) => void | Promise<void>

/** Structural subset of the real `SupabaseClient` this store depends on, so
 * tests can inject a fake instead of hitting the network (same seam as
 * lobby/store.ts's `ConnectFn`). */
export interface AuthSupabaseClient {
  auth: {
    onAuthStateChange(callback: AuthChangeCallback): { data: { subscription: { unsubscribe(): void } } }
    signInWithPassword(creds: { email: string; password: string }): Promise<{ error: { message: string } | null }>
    signUp(args: {
      email: string
      password: string
      options?: { data?: { username: string } }
    }): Promise<{ error: { message: string } | null }>
    signOut(): Promise<{ error: { message: string } | null }>
    resetPasswordForEmail(email: string): Promise<{ error: { message: string } | null }>
    verifyOtp(args: {
      email: string
      token: string
      type: 'recovery'
    }): Promise<{ error: { message: string } | null }>
    updateUser(args: { password: string }): Promise<{ error: { message: string } | null }>
  }
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        single(): Promise<{ data: ProfileRow | null; error: { message: string } | null }>
      }
    }
  }
  rpc(fn: string, params?: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>
}

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

type Listener = () => void

const BAD_CREDENTIALS_ERROR = 'Invalid username/email or password.'

const initialState = (cachedCoins: number): AuthState => ({
  status: 'loading',
  userId: null,
  username: null,
  email: null,
  coins: cachedCoins,
  error: null,
})

function validateUsername(username: string): string | null {
  if (username.length < 3 || username.length > 16 || !USERNAME_PATTERN.test(username)) {
    return 'Username must be 3-16 characters: letters, numbers, underscore only.'
  }
  return null
}

function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters.'
  return null
}

function validateEmail(email: string): string | null {
  if (!email.includes('@')) return 'Enter a valid email address.'
  return null
}

function validateResetCode(code: string): string | null {
  // Supabase's recovery OTP is 8 digits (not the commonly-assumed 6) — this
  // was verified against a real sent email, not just docs.
  if (!/^\d{8}$/.test(code)) return 'Enter the 8-digit code from your email.'
  return null
}

/** Exported for tests, which inject a fake Supabase client (and optionally a
 * fake `loginWithUsernameFn`/storage); the app uses the `authStore` singleton. */
export function createAuthStore(
  deps: {
    supabaseClient?: AuthSupabaseClient
    storage?: StorageLike
    loginWithUsernameFn?: (username: string, password: string) => Promise<{ error: string | null }>
  } = {},
) {
  const supabaseClient = deps.supabaseClient ?? (supabase as unknown as AuthSupabaseClient)
  const storage = deps.storage ?? { getItem, setItem, removeItem }
  const loginWithUsernameFn = deps.loginWithUsernameFn ?? loginWithUsername

  const cachedCoins = Number.parseInt(storage.getItem(COINS_CACHE_KEY) ?? '', 10)
  let state: AuthState = initialState(Number.isFinite(cachedCoins) ? cachedCoins : 0)
  const listeners = new Set<Listener>()

  const getState = () => state
  const subscribe = (l: Listener): (() => void) => {
    listeners.add(l)
    return () => void listeners.delete(l)
  }
  const set = (patch: Partial<AuthState>) => {
    state = { ...state, ...patch }
    listeners.forEach((l) => l())
  }

  async function handleSessionChange(session: AuthSession | null): Promise<void> {
    if (!session) {
      storage.removeItem(COINS_CACHE_KEY)
      set({ status: 'signedOut', userId: null, username: null, email: null, coins: 0, error: null })
      return
    }

    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('username, coins')
      .eq('id', session.user.id)
      .single()
    const coins = profile?.coins ?? 0
    storage.setItem(COINS_CACHE_KEY, String(coins))
    set({
      status: 'signedIn',
      userId: session.user.id,
      username: profile?.username ?? null,
      email: session.user.email,
      coins,
      error: null,
    })
  }

  // supabase-js always fires once on subscribe with the current session (or
  // null) — that single subscription covers both boot hydration and every
  // later sign-in/sign-out transition, so there's no separate getSession()
  // call needed at construction.
  supabaseClient.auth.onAuthStateChange((_event, session) => handleSessionChange(session))

  async function signIn(usernameOrEmail: string, password: string): Promise<void> {
    set({ error: null })
    const { error } = usernameOrEmail.includes('@')
      ? await supabaseClient.auth.signInWithPassword({ email: usernameOrEmail, password })
      : await loginWithUsernameFn(usernameOrEmail, password)
    if (error) {
      set({ error: BAD_CREDENTIALS_ERROR })
    }
    // Success intentionally does not flip status here — onAuthStateChange is
    // the single source of truth for signedIn state.
  }

  async function signUp(username: string, email: string, password: string): Promise<void> {
    set({ error: null })
    const usernameError = validateUsername(username)
    if (usernameError) {
      set({ error: usernameError })
      return
    }
    const passwordError = validatePassword(password)
    if (passwordError) {
      set({ error: passwordError })
      return
    }

    const { data: available, error: availabilityError } = await supabaseClient.rpc('is_username_available', {
      p_username: username,
    })
    if (availabilityError) {
      set({ error: availabilityError.message })
      return
    }
    if (!available) {
      set({ error: 'Username already taken.' })
      return
    }

    const { error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: { data: { username } },
    })
    if (error) set({ error: error.message })
    // Success: signup with email confirmation off returns an active session,
    // which onAuthStateChange picks up and flips status to signedIn.
  }

  async function signOut(): Promise<void> {
    await supabaseClient.auth.signOut()
    // onAuthStateChange's SIGNED_OUT event resets state and clears the cache.
  }

  function clearError(): void {
    set({ error: null })
  }

  function applyCoinsUpdate(balance: number): void {
    set({ coins: balance })
    storage.setItem(COINS_CACHE_KEY, String(balance))
  }

  async function requestPasswordReset(email: string): Promise<void> {
    set({ error: null })
    const emailError = validateEmail(email)
    if (emailError) {
      set({ error: emailError })
      return
    }
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email)
    if (error) set({ error: error.message })
  }

  async function confirmPasswordReset(email: string, code: string, newPassword: string): Promise<void> {
    set({ error: null })
    const codeError = validateResetCode(code)
    if (codeError) {
      set({ error: codeError })
      return
    }
    const passwordError = validatePassword(newPassword)
    if (passwordError) {
      set({ error: passwordError })
      return
    }

    const { error: otpError } = await supabaseClient.auth.verifyOtp({ email, token: code, type: 'recovery' })
    if (otpError) {
      set({ error: 'Invalid or expired code.' })
      return
    }

    const { error: updateError } = await supabaseClient.auth.updateUser({ password: newPassword })
    if (updateError) set({ error: updateError.message })
    // Success: verifyOtp already established a session — onAuthStateChange
    // is the single source of truth and flips status to signedIn from here.
  }

  return {
    getState,
    subscribe,
    signIn,
    signUp,
    signOut,
    clearError,
    applyCoinsUpdate,
    requestPasswordReset,
    confirmPasswordReset,
  }
}

export const authStore = createAuthStore()
