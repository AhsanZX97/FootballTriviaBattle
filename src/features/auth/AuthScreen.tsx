import { useEffect, useState, useSyncExternalStore, type FormEvent } from 'react'
import bg from '../../assets/bg.jpg'
import { authStore } from './store'
import type { AuthStore } from './store'
import '../menu/IntroScreen.css'
import './AuthScreen.css'

type Mode = 'signin' | 'signup' | 'reset-request' | 'reset-confirm'

const TITLES: Record<Mode, string> = {
  signin: 'SIGN IN',
  signup: 'SIGN UP',
  'reset-request': 'RESET PASSWORD',
  'reset-confirm': 'RESET PASSWORD',
}

type Props = {
  /** Android back button / an on-screen back arrow — navigation is App.tsx's job. */
  onBack: () => void
  /** Fired once the store reports `signedIn` after a successful submit. */
  onAuthenticated?: () => void
  initialMode?: Mode
  /** Defaults to the real singleton; tests inject a fake. */
  store?: AuthStore
}

export function AuthScreen({ onBack, onAuthenticated, initialMode = 'signin', store = authStore }: Props) {
  const state = useSyncExternalStore(store.subscribe, store.getState)
  const [mode, setMode] = useState<Mode>(initialMode)
  const [pending, setPending] = useState(false)

  // sign-in fields
  const [usernameOrEmail, setUsernameOrEmail] = useState('')
  const [signInPassword, setSignInPassword] = useState('')

  // sign-up fields
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [signUpPassword, setSignUpPassword] = useState('')

  // password reset fields
  const [resetEmail, setResetEmail] = useState('')
  const [resetCode, setResetCode] = useState('')
  const [resetNewPassword, setResetNewPassword] = useState('')

  // signIn/signUp don't flip `status` synchronously — the store's own
  // onAuthStateChange subscription is the source of truth for that, and it
  // can land either mid-await or slightly after. React to the store instead
  // of the awaited call's return so both timings are covered.
  useEffect(() => {
    if (state.status === 'signedIn') onAuthenticated?.()
    // intentionally keyed on status alone — fire only on the signedOut/loading → signedIn transition
  }, [state.status])

  function clearErrorOnEdit() {
    if (state.error) store.clearError()
  }

  function switchMode(next: Mode) {
    store.clearError()
    setMode(next)
  }

  async function handleSignIn(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    await store.signIn(usernameOrEmail, signInPassword)
    setPending(false)
  }

  async function handleSignUp(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    await store.signUp(username, email, signUpPassword)
    setPending(false)
  }

  function openForgotPassword() {
    store.clearError()
    // nicety: carry over the sign-in field if it already looks like an email
    setResetEmail(usernameOrEmail.includes('@') ? usernameOrEmail : '')
    setMode('reset-request')
  }

  async function handleRequestReset(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    await store.requestPasswordReset(resetEmail)
    setPending(false)
    // store.getState(), not the reactive `state`, since this closure's
    // `state` is a stale snapshot from render time until React re-renders.
    if (!store.getState().error) setMode('reset-confirm')
  }

  async function handleConfirmReset(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    await store.confirmPasswordReset(resetEmail, resetCode, resetNewPassword)
    setPending(false)
    // success flips status to signedIn via the store's onAuthStateChange
    // subscription, which the effect above already reacts to.
  }

  return (
    <main className="intro auth">
      <img className="intro__bg" src={bg} alt="" aria-hidden />
      <div className="intro__overlay" aria-hidden />
      <div className="intro__vignette" aria-hidden />
      <div className="intro__scanlines" aria-hidden />
      <div className="intro__content">
        <div className="auth__panel">
          <button type="button" className="auth__back" onClick={onBack} aria-label="Back to menu">
            ◂ BACK
          </button>

          <h1 className="auth__title">{TITLES[mode]}</h1>

          {mode === 'signin' ? (
            <form className="auth__form" onSubmit={handleSignIn}>
              <input
                type="text"
                className="auth__input"
                placeholder="Username or email"
                aria-label="Username or email"
                value={usernameOrEmail}
                onChange={(e) => {
                  setUsernameOrEmail(e.target.value)
                  clearErrorOnEdit()
                }}
              />
              <input
                type="password"
                className="auth__input"
                placeholder="Password"
                aria-label="Password"
                value={signInPassword}
                onChange={(e) => {
                  setSignInPassword(e.target.value)
                  clearErrorOnEdit()
                }}
              />
              {state.error && <p className="auth__error">⚠ {state.error}</p>}
              <button type="submit" className="auth__submit" disabled={pending}>
                {pending ? 'SIGNING IN…' : 'SIGN IN'}
              </button>
              <div className="auth__link-row">
                <button type="button" className="auth__link auth__link--small" onClick={() => switchMode('signup')}>
                  Sign Up
                </button>
                <button type="button" className="auth__link auth__link--small" onClick={openForgotPassword}>
                  Forgot password?
                </button>
              </div>
            </form>
          ) : mode === 'signup' ? (
            <form className="auth__form" onSubmit={handleSignUp}>
              <input
                type="text"
                className="auth__input"
                placeholder="Username"
                aria-label="Username"
                maxLength={16}
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value)
                  clearErrorOnEdit()
                }}
              />
              <input
                type="email"
                className="auth__input"
                placeholder="Email"
                aria-label="Email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  clearErrorOnEdit()
                }}
              />
              <input
                type="password"
                className="auth__input"
                placeholder="Password"
                aria-label="Password"
                value={signUpPassword}
                onChange={(e) => {
                  setSignUpPassword(e.target.value)
                  clearErrorOnEdit()
                }}
              />
              <p className="auth__helper">min 8 characters</p>
              {state.error && <p className="auth__error">⚠ {state.error}</p>}
              <button type="submit" className="auth__submit" disabled={pending}>
                {pending ? 'SIGNING UP…' : 'SIGN UP'}
              </button>
              <button type="button" className="auth__link" onClick={() => switchMode('signin')}>
                ◂ back to sign in
              </button>
            </form>
          ) : mode === 'reset-request' ? (
            <form className="auth__form" onSubmit={handleRequestReset}>
              <p className="auth__helper">Enter your account email and we'll send an 8-digit code.</p>
              <input
                type="email"
                className="auth__input"
                placeholder="Email"
                aria-label="Email"
                value={resetEmail}
                onChange={(e) => {
                  setResetEmail(e.target.value)
                  clearErrorOnEdit()
                }}
              />
              {state.error && <p className="auth__error">⚠ {state.error}</p>}
              <button type="submit" className="auth__submit" disabled={pending}>
                {pending ? 'SENDING…' : 'SEND CODE'}
              </button>
              <button type="button" className="auth__link" onClick={() => switchMode('signin')}>
                ◂ back to sign in
              </button>
            </form>
          ) : (
            <form className="auth__form" onSubmit={handleConfirmReset}>
              <p className="auth__helper">Code sent to {resetEmail}</p>
              <input
                type="text"
                className="auth__input"
                placeholder="8-digit code"
                aria-label="Code"
                inputMode="numeric"
                maxLength={8}
                value={resetCode}
                onChange={(e) => {
                  setResetCode(e.target.value)
                  clearErrorOnEdit()
                }}
              />
              <input
                type="password"
                className="auth__input"
                placeholder="New password"
                aria-label="New password"
                value={resetNewPassword}
                onChange={(e) => {
                  setResetNewPassword(e.target.value)
                  clearErrorOnEdit()
                }}
              />
              <p className="auth__helper">min 8 characters</p>
              {state.error && <p className="auth__error">⚠ {state.error}</p>}
              <button type="submit" className="auth__submit" disabled={pending}>
                {pending ? 'RESETTING…' : 'RESET PASSWORD'}
              </button>
              <div className="auth__link-row">
                <button
                  type="button"
                  className="auth__link auth__link--small"
                  disabled={pending}
                  onClick={() => void store.requestPasswordReset(resetEmail)}
                >
                  Resend code
                </button>
                <button type="button" className="auth__link auth__link--small" onClick={() => switchMode('signin')}>
                  ◂ back to sign in
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </main>
  )
}
