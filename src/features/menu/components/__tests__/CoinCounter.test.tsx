import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { AuthState } from '../../../../types/auth'
import type { AuthStore } from '../../../auth/store'
import { CoinCounter } from '../CoinCounter'

function createFakeStore(state: AuthState): AuthStore {
  return {
    getState: () => state,
    subscribe: () => () => {},
    signIn: async () => {},
    signUp: async () => {},
    signOut: async () => {},
    clearError: () => {},
    applyCoinsUpdate: () => {},
    requestPasswordReset: async () => {},
    confirmPasswordReset: async () => {},
  }
}

const signedOut: AuthState = {
  status: 'signedOut',
  userId: null,
  username: null,
  email: null,
  coins: 0,
  error: null,
}

describe('CoinCounter', () => {
  it('shows 0 when signed out', () => {
    render(<CoinCounter store={createFakeStore(signedOut)} />)
    expect(screen.getByText('0')).toBeDefined()
  })

  it('shows 0 while still loading, not the cached coins value', () => {
    render(<CoinCounter store={createFakeStore({ ...signedOut, status: 'loading', coins: 42 })} />)
    expect(screen.getByText('0')).toBeDefined()
  })

  it('shows the actual coins value when signed in', () => {
    render(
      <CoinCounter
        store={createFakeStore({
          status: 'signedIn',
          userId: 'u1',
          username: 'Ahsan',
          email: 'a@b.com',
          coins: 42,
          error: null,
        })}
      />,
    )
    expect(screen.getByText('42')).toBeDefined()
  })
})
