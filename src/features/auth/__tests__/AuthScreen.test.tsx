import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import type { AuthState } from '../../../types/auth'
import { defaultCustomization } from '../../../types/customization'
import type { AuthStore } from '../store'
import { AuthScreen } from '../AuthScreen'

const initialState: AuthState = {
  status: 'signedOut',
  userId: null,
  username: null,
  email: null,
  coins: 0,
  customization: defaultCustomization(),
  error: null,
}

/** Minimal in-memory fake matching the `AuthStore` contract, mirroring the
 * `createFakeSocket` pattern used in lobby/store.test.ts. */
function createFakeStore(initial: Partial<AuthState> = {}) {
  let state: AuthState = { ...initialState, ...initial }
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((l) => l())
  const setState = (patch: Partial<AuthState>) => {
    state = { ...state, ...patch }
    notify()
  }
  const store: AuthStore = {
    getState: () => state,
    subscribe: (l) => {
      listeners.add(l)
      return () => void listeners.delete(l)
    },
    signIn: vi.fn(async () => {}),
    signUp: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
    clearError: () => setState({ error: null }),
    applyCoinsUpdate: (balance) => setState({ coins: balance }),
    applyCustomizationUpdate: (slot, itemId) =>
      setState({ customization: { ...state.customization, [slot]: itemId } }),
    requestPasswordReset: vi.fn(async () => {}),
    confirmPasswordReset: vi.fn(async () => {}),
  }
  return { store, setState }
}

describe('AuthScreen', () => {
  it('renders sign-in fields by default', () => {
    const { store } = createFakeStore()
    render(<AuthScreen onBack={() => {}} store={store} />)
    expect(screen.getByLabelText(/username or email/i)).toBeDefined()
    expect(screen.getByLabelText(/^password$/i)).toBeDefined()
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeDefined()
  })

  it('switches to sign-up fields when Sign Up is clicked', () => {
    const { store } = createFakeStore()
    render(<AuthScreen onBack={() => {}} store={store} />)
    fireEvent.click(screen.getByRole('button', { name: /sign up/i }))
    expect(screen.getByLabelText(/^username$/i)).toBeDefined()
    expect(screen.getByLabelText(/^email$/i)).toBeDefined()
    expect(screen.getByLabelText(/^password$/i)).toBeDefined()
    expect(screen.getByText(/min 8 characters/i)).toBeDefined()
    expect(screen.getByRole('button', { name: /^sign up$/i })).toBeDefined()
  })

  it('switches back to sign-in fields from sign-up', () => {
    const { store } = createFakeStore()
    render(<AuthScreen onBack={() => {}} store={store} initialMode="signup" />)
    fireEvent.click(screen.getByText(/back to sign in/i))
    expect(screen.getByLabelText(/username or email/i)).toBeDefined()
  })

  it('shows an error message surfaced by the store', () => {
    const { store } = createFakeStore({ error: 'Invalid credentials' })
    render(<AuthScreen onBack={() => {}} store={store} />)
    expect(screen.getByText(/invalid credentials/i)).toBeDefined()
  })

  it('clears the store error when the user edits a field', () => {
    const { store } = createFakeStore({ error: 'Invalid credentials' })
    render(<AuthScreen onBack={() => {}} store={store} />)
    fireEvent.change(screen.getByLabelText(/username or email/i), { target: { value: 'bob' } })
    expect(store.clearError).toBeDefined() // sanity: still same store instance
    expect(store.getState().error).toBeNull()
  })

  it('disables the Sign In button while a submission is pending, then re-enables it', async () => {
    const { store } = createFakeStore()
    let resolveSignIn: () => void = () => {}
    store.signIn = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSignIn = resolve
        }),
    )
    render(<AuthScreen onBack={() => {}} store={store} />)
    fireEvent.change(screen.getByLabelText(/username or email/i), { target: { value: 'bob' } })
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'password1' } })
    const submitButton = screen.getByRole('button', { name: /^sign in$/i })
    fireEvent.click(submitButton)

    // same DOM node throughout — label swaps to "SIGNING IN…" while pending
    expect(submitButton.hasAttribute('disabled')).toBe(true)

    await act(async () => {
      resolveSignIn()
      await Promise.resolve()
    })

    expect(submitButton.hasAttribute('disabled')).toBe(false)
  })

  it('calls onAuthenticated after a successful sign-in', async () => {
    const { store, setState } = createFakeStore()
    store.signIn = vi.fn(async () => {
      setState({ status: 'signedIn', userId: 'u1', username: 'bob', coins: 0 })
    })
    const onAuthenticated = vi.fn()
    render(<AuthScreen onBack={() => {}} store={store} onAuthenticated={onAuthenticated} />)
    fireEvent.change(screen.getByLabelText(/username or email/i), { target: { value: 'bob' } })
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'password1' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }))
    })
    expect(onAuthenticated).toHaveBeenCalled()
  })

  it('calls onBack when the back control is clicked', () => {
    const { store } = createFakeStore()
    const onBack = vi.fn()
    render(<AuthScreen onBack={onBack} store={store} />)
    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(onBack).toHaveBeenCalled()
  })

  it('shows Sign Up and Forgot password as a row on the sign-in screen', () => {
    const { store } = createFakeStore()
    render(<AuthScreen onBack={() => {}} store={store} />)
    expect(screen.getByRole('button', { name: /sign up/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /forgot password/i })).toBeDefined()
  })
})

describe('AuthScreen password reset', () => {
  it('switches to the reset-request form when Forgot password is clicked', () => {
    const { store } = createFakeStore()
    render(<AuthScreen onBack={() => {}} store={store} />)
    fireEvent.click(screen.getByRole('button', { name: /forgot password/i }))
    expect(screen.getByLabelText(/email/i)).toBeDefined()
    expect(screen.getByRole('button', { name: /send code/i })).toBeDefined()
  })

  it('advances to the code+password form once the reset email is sent', async () => {
    const { store } = createFakeStore()
    render(<AuthScreen onBack={() => {}} store={store} />)
    fireEvent.click(screen.getByRole('button', { name: /forgot password/i }))
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'bob@example.com' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /send code/i }))
    })

    expect(store.requestPasswordReset).toHaveBeenCalledWith('bob@example.com')
    expect(screen.getByLabelText(/code/i)).toBeDefined()
    expect(screen.getByLabelText(/new password/i)).toBeDefined()
  })

  it('does not advance to the code form when the store reports an error', async () => {
    // A well-formed address so the native type="email" input doesn't block
    // the submit itself — this exercises a server-side failure (e.g. a
    // Supabase rate limit), which is the realistic way requestPasswordReset
    // surfaces an error; the store's own client-side check is deliberately
    // permissive (just requires an "@"), so it can't itself distinguish a
    // "malformed" address from what the browser already rejects.
    const { store, setState } = createFakeStore()
    store.requestPasswordReset = vi.fn(async () => {
      setState({ error: 'Too many requests. Try again later.' })
    })
    render(<AuthScreen onBack={() => {}} store={store} />)
    fireEvent.click(screen.getByRole('button', { name: /forgot password/i }))
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'bob@example.com' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /send code/i }))
    })

    expect(store.requestPasswordReset).toHaveBeenCalledWith('bob@example.com')
    expect(screen.queryByLabelText(/^code$/i)).toBeNull()
    expect(screen.getByText(/too many requests/i)).toBeDefined()
  })

  it('submits the code and new password to confirmPasswordReset', async () => {
    const { store } = createFakeStore()
    render(<AuthScreen onBack={() => {}} store={store} />)
    fireEvent.click(screen.getByRole('button', { name: /forgot password/i }))
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'bob@example.com' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /send code/i }))
    })

    fireEvent.change(screen.getByLabelText(/^code$/i), { target: { value: '12345678' } })
    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: 'newpassword1' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /reset password/i }))
    })

    expect(store.confirmPasswordReset).toHaveBeenCalledWith('bob@example.com', '12345678', 'newpassword1')
  })

  it('returns to sign-in from the reset-request screen', () => {
    const { store } = createFakeStore()
    render(<AuthScreen onBack={() => {}} store={store} />)
    fireEvent.click(screen.getByRole('button', { name: /forgot password/i }))
    fireEvent.click(screen.getByText(/back to sign in/i))
    expect(screen.getByLabelText(/username or email/i)).toBeDefined()
  })
})
