import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { AuthState } from '../../../types/auth'

let authState: AuthState = {
  status: 'signedOut',
  userId: null,
  username: null,
  email: null,
  coins: 0,
  error: null,
}
const signOut = vi.fn(async () => {})
vi.mock('../../auth/store', () => ({
  authStore: {
    getState: () => authState,
    subscribe: () => () => {},
    signOut: () => signOut(),
  },
}))

import { IntroScreen } from '../IntroScreen'

beforeEach(() => {
  authState = {
    status: 'signedOut',
    userId: null,
    username: null,
    email: null,
    coins: 0,
    error: null,
  }
  signOut.mockClear()
})

describe('IntroScreen', () => {
  it('shows a Sign In button when signed out', () => {
    render(<IntroScreen />)
    expect(screen.getByRole('button', { name: /sign in/i })).toBeDefined()
    expect(screen.queryByRole('button', { name: /sign out/i })).toBeNull()
  })

  it('calls onSignIn when Sign In is clicked', () => {
    const onSignIn = vi.fn()
    render(<IntroScreen onSignIn={onSignIn} />)
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    expect(onSignIn).toHaveBeenCalled()
  })

  it('shows Sign Out instead of Sign In when signed in', () => {
    authState = {
      status: 'signedIn',
      userId: 'u1',
      username: 'Ahsan',
      email: 'a@b.com',
      coins: 5,
      error: null,
    }
    render(<IntroScreen />)
    expect(screen.getByRole('button', { name: /sign out/i })).toBeDefined()
    expect(screen.queryByRole('button', { name: /^sign in$/i })).toBeNull()
  })

  it('calls authStore.signOut when Sign Out is clicked', () => {
    authState = {
      status: 'signedIn',
      userId: 'u1',
      username: 'Ahsan',
      email: 'a@b.com',
      coins: 5,
      error: null,
    }
    render(<IntroScreen />)
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }))
    expect(signOut).toHaveBeenCalled()
  })

  it('renders the Shop button disabled', () => {
    render(<IntroScreen />)
    const shopButton = screen.getByRole('button', { name: /shop/i })
    expect(shopButton.hasAttribute('disabled')).toBe(true)
  })
})
