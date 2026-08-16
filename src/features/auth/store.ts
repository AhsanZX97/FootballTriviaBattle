import type { AuthState } from '../../types/auth'
import type { Customization, CustomizationSlot } from '../../types/customization'
import { defaultCustomization } from '../../types/customization'
import { getItem, removeItem, setItem } from '../../services/storage'
import { dailyKey } from '../../services/dailyChallenges'
import { loginWithUsername, supabase } from '../../services/supabase'
import { t } from '../../services/i18n/store'
import { analytics } from '../../services/analytics'

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
  /** Claims today's daily login reward via the server RPC. Resolves with the
   * granted reward and resulting streak (or `alreadyClaimed`), or null on
   * failure / when signed out. Updates coins + streak state on success. */
  claimDailyReward(): Promise<DailyRewardResult | null>
  /** Reflects a slot the shop has already equipped server-side, so the change
   * shows without a full profile refetch. */
  applyCustomizationUpdate(slot: CustomizationSlot, itemId: string): void
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

/** Shape of the `claim_daily_reward` RPC's jsonb result. */
export interface DailyRewardResult {
  alreadyClaimed: boolean
  coins: number
  /** Day-in-cycle (1..7) that was (or already had been) claimed. */
  streak: number
  /** Coins granted by this claim; 0 when already claimed. */
  reward: number
}

/** Session shape this store needs — a structural subset of supabase-js's `Session`. */
interface AuthSession {
  access_token: string
  refresh_token: string
  user: { id: string; email: string | null }
}

interface ProfileRow {
  username: string
  coins: number
  gk_skin: string
  ball_skin: string
  goal_sound: string
  daily_reward_streak: number
  last_daily_reward_date: string | null
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

/**
 * Supabase reports failures as English prose, which would sit untranslated in
 * the middle of an otherwise localised screen. Classify the few messages that
 * actually reach a player into our own keys and translate those; anything
 * unrecognised becomes a generic message rather than leaking raw server text.
 *
 * Matching on message text is unavoidable — GoTrue doesn't return stable codes
 * for these — so the fallback matters more than the individual patterns.
 */
function supabaseErrorMessage(message: string): string {
  const text = message.toLowerCase()
  if (text.includes('already registered') || text.includes('already been registered')) {
    return t('auth.error.emailTaken')
  }
  if (text.includes('rate limit') || text.includes('too many')) return t('auth.error.rateLimited')
  if (text.includes('invalid login credentials')) return t('auth.error.badCredentials')
  if (text.includes('failed to fetch') || text.includes('network')) return t('auth.error.network')
  if (text.includes('password')) return t('auth.error.passwordLength')
  if (text.includes('email')) return t('auth.error.emailInvalid')
  return t('auth.error.generic')
}

const initialState = (cachedCoins: number): AuthState => ({
  status: 'loading',
  userId: null,
  username: null,
  email: null,
  coins: cachedCoins,
  customization: defaultCustomization(),
  dailyRewardStreak: 0,
  lastDailyRewardDate: null,
  error: null,
})

/** Tolerates a profile row from before 0003_customization.sql (or a failed
 * fetch) by falling back to the stock set rather than leaving slots undefined. */
function readCustomization(profile: ProfileRow | null): Customization {
  const stock = defaultCustomization()
  return {
    gkSkin: profile?.gk_skin ?? stock.gkSkin,
    ballSkin: profile?.ball_skin ?? stock.ballSkin,
    goalSound: profile?.goal_sound ?? stock.goalSound,
  }
}

function validateUsername(username: string): string | null {
  if (username.length < 3 || username.length > 16 || !USERNAME_PATTERN.test(username)) {
    return t('auth.error.usernameFormat')
  }
  return null
}

function validatePassword(password: string): string | null {
  if (password.length < 8) return t('auth.error.passwordLength')
  return null
}

function validateEmail(email: string): string | null {
  if (!email.includes('@')) return t('auth.error.emailInvalid')
  return null
}

function validateResetCode(code: string): string | null {
  // Supabase's recovery OTP is 8 digits (not the commonly-assumed 6) — this
  // was verified against a real sent email, not just docs.
  if (!/^\d{8}$/.test(code)) return t('auth.error.codeFormat')
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
      set({
        status: 'signedOut',
        userId: null,
        username: null,
        email: null,
        coins: 0,
        customization: defaultCustomization(),
        dailyRewardStreak: 0,
        lastDailyRewardDate: null,
        error: null,
      })
      return
    }

    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('username, coins, gk_skin, ball_skin, goal_sound, daily_reward_streak, last_daily_reward_date')
      .eq('id', session.user.id)
      .single()
    const coins = profile?.coins ?? 0
    storage.setItem(COINS_CACHE_KEY, String(coins))
    // Links every event this install already sent — all the pre-signup play —
    // to the new account, so a converted player's history stays one funnel
    // rather than an anonymous stub plus a fresh user. Deliberately not paired
    // with a reset() on sign-out: one device is one player here, and resetting
    // would mint a new anonymous id that no longer matches the stored install
    // id, splitting that player's retention in two.
    analytics.identify(session.user.id)
    set({
      status: 'signedIn',
      userId: session.user.id,
      username: profile?.username ?? null,
      email: session.user.email,
      coins,
      customization: readCustomization(profile),
      dailyRewardStreak: profile?.daily_reward_streak ?? 0,
      lastDailyRewardDate: profile?.last_daily_reward_date ?? null,
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
      set({ error: t('auth.error.badCredentials') })
    } else {
      analytics.track('signin_done', {})
    }
    // Success intentionally does not flip status here — onAuthStateChange is
    // the single source of truth for signedIn state.
  }

  async function signUp(username: string, email: string, password: string): Promise<void> {
    set({ error: null })
    // Fired before validation so the gap between submitted and done measures
    // every way the form can reject someone, not just server-side failures.
    analytics.track('signup_submitted', {})
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
      set({ error: supabaseErrorMessage(availabilityError.message) })
      return
    }
    if (!available) {
      set({ error: t('auth.error.usernameTaken') })
      return
    }

    const { error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: { data: { username } },
    })
    if (error) set({ error: supabaseErrorMessage(error.message) })
    else analytics.track('signup_done', {})
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

  async function claimDailyReward(): Promise<DailyRewardResult | null> {
    if (state.status !== 'signedIn') return null
    try {
      const { data, error } = await supabaseClient.rpc('claim_daily_reward')
      if (error || data == null || typeof data !== 'object') return null
      const row = data as { already_claimed?: boolean; coins?: number; streak?: number; reward?: number }
      if (typeof row.coins !== 'number' || typeof row.streak !== 'number') return null
      const result: DailyRewardResult = {
        alreadyClaimed: row.already_claimed === true,
        coins: row.coins,
        streak: row.streak,
        reward: typeof row.reward === 'number' ? row.reward : 0,
      }
      storage.setItem(COINS_CACHE_KEY, String(result.coins))
      set({
        coins: result.coins,
        dailyRewardStreak: result.streak,
        lastDailyRewardDate: dailyKey(),
      })
      return result
    } catch {
      return null
    }
  }

  function applyCustomizationUpdate(slot: CustomizationSlot, itemId: string): void {
    set({ customization: { ...state.customization, [slot]: itemId } })
  }

  async function requestPasswordReset(email: string): Promise<void> {
    set({ error: null })
    const emailError = validateEmail(email)
    if (emailError) {
      set({ error: emailError })
      return
    }
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email)
    if (error) set({ error: supabaseErrorMessage(error.message) })
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
      set({ error: t('auth.error.codeInvalid') })
      return
    }

    const { error: updateError } = await supabaseClient.auth.updateUser({ password: newPassword })
    if (updateError) set({ error: supabaseErrorMessage(updateError.message) })
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
    claimDailyReward,
    applyCustomizationUpdate,
    requestPasswordReset,
    confirmPasswordReset,
  }
}

export const authStore = createAuthStore()
