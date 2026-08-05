import { useEffect, useState, useSyncExternalStore, type FormEvent } from 'react'
import bg from '../../assets/bg.jpg'
import { authStore } from './store'
import type { AuthStore } from './store'
import { Sprite } from '../../components/Sprite'
import '../menu/IntroScreen.css'
import './AuthScreen.css'
import { useT } from '../../services/i18n/store'
import type { MessageKey } from '../../services/i18n/messages/en'

type Mode = 'signin' | 'signup' | 'reset-request' | 'reset-confirm'

const TITLE_KEYS = {
  signin: 'auth.title.signin',
  signup: 'auth.title.signup',
  'reset-request': 'auth.title.reset',
  'reset-confirm': 'auth.title.reset',
} as const satisfies Record<Mode, MessageKey>

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
  const t = useT()
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
          <h1 className="auth__title">{t(TITLE_KEYS[mode])}</h1>

          {mode === 'signin' ? (
            <form className="auth__form" onSubmit={handleSignIn}>
              <input
                type="text"
                className="auth__input"
                placeholder={t('auth.usernameOrEmail')}
                aria-label={t('auth.usernameOrEmail')}
                value={usernameOrEmail}
                onChange={(e) => {
                  setUsernameOrEmail(e.target.value)
                  clearErrorOnEdit()
                }}
              />
              <input
                type="password"
                className="auth__input"
                placeholder={t('auth.password')}
                aria-label={t('auth.password')}
                value={signInPassword}
                onChange={(e) => {
                  setSignInPassword(e.target.value)
                  clearErrorOnEdit()
                }}
              />
              {state.error && (
                <p className="auth__error">
                  <Sprite name="warning" /> {state.error}
                </p>
              )}
              <button type="submit" className="auth__submit" disabled={pending}>
                {pending ? t('auth.signingIn') : t('auth.signIn')}
              </button>
              <div className="auth__btn-row">
                <button type="button" className="auth__secondary" onClick={() => switchMode('signup')}>
                  {t('auth.signUpLink')}
                </button>
                <button type="button" className="auth__secondary" onClick={openForgotPassword}>
                  {t('auth.forgotPassword')}
                </button>
              </div>
            </form>
          ) : mode === 'signup' ? (
            <form className="auth__form" onSubmit={handleSignUp}>
              <input
                type="text"
                className="auth__input"
                placeholder={t('auth.username')}
                aria-label={t('auth.username')}
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
                placeholder={t('auth.email')}
                aria-label={t('auth.email')}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  clearErrorOnEdit()
                }}
              />
              <input
                type="password"
                className="auth__input"
                placeholder={t('auth.password')}
                aria-label={t('auth.password')}
                value={signUpPassword}
                onChange={(e) => {
                  setSignUpPassword(e.target.value)
                  clearErrorOnEdit()
                }}
              />
              <p className="auth__helper">{t('auth.minChars')}</p>
              {state.error && (
                <p className="auth__error">
                  <Sprite name="warning" /> {state.error}
                </p>
              )}
              <button type="submit" className="auth__submit" disabled={pending}>
                {pending ? t('auth.signingUp') : t('auth.signUp')}
              </button>
              <button type="button" className="auth__link" onClick={() => switchMode('signin')}>
                ◂ {t('auth.backToSignIn')}
              </button>
            </form>
          ) : mode === 'reset-request' ? (
            <form className="auth__form" onSubmit={handleRequestReset}>
              <p className="auth__helper auth__helper--lead">{t('auth.resetLead')}</p>
              <input
                type="email"
                className="auth__input"
                placeholder={t('auth.email')}
                aria-label={t('auth.email')}
                value={resetEmail}
                onChange={(e) => {
                  setResetEmail(e.target.value)
                  clearErrorOnEdit()
                }}
              />
              {state.error && (
                <p className="auth__error">
                  <Sprite name="warning" /> {state.error}
                </p>
              )}
              <button type="submit" className="auth__submit" disabled={pending}>
                {pending ? t('auth.sending') : t('auth.sendCode')}
              </button>
              <button type="button" className="auth__link" onClick={() => switchMode('signin')}>
                ◂ {t('auth.backToSignIn')}
              </button>
            </form>
          ) : (
            <form className="auth__form" onSubmit={handleConfirmReset}>
              <p className="auth__helper">{t('auth.codeSentTo', { email: resetEmail })}</p>
              <input
                type="text"
                className="auth__input"
                placeholder={t('auth.codePlaceholder')}
                aria-label={t('auth.codeAria')}
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
                placeholder={t('auth.newPassword')}
                aria-label={t('auth.newPassword')}
                value={resetNewPassword}
                onChange={(e) => {
                  setResetNewPassword(e.target.value)
                  clearErrorOnEdit()
                }}
              />
              <p className="auth__helper">{t('auth.minChars')}</p>
              {state.error && (
                <p className="auth__error">
                  <Sprite name="warning" /> {state.error}
                </p>
              )}
              <button type="submit" className="auth__submit" disabled={pending}>
                {pending ? t('auth.resetting') : t('auth.resetPassword')}
              </button>
              <div className="auth__link-row">
                <button
                  type="button"
                  className="auth__link auth__link--small"
                  disabled={pending}
                  onClick={() => void store.requestPasswordReset(resetEmail)}
                >
                  {t('auth.resendCode')}
                </button>
                <button type="button" className="auth__link auth__link--small" onClick={() => switchMode('signin')}>
                  ◂ {t('auth.backToSignIn')}
                </button>
              </div>
            </form>
          )}

          <button type="button" className="auth__back" onClick={onBack} aria-label={t('auth.backToMenu')}>
            ◂ {t('common.back')}
          </button>
        </div>
      </div>
    </main>
  )
}
