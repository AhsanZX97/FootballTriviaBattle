import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { AuthState } from '../../../types/auth'

let authState: AuthState = {
  status: 'signedOut',
  userId: null,
  username: null,
  email: null,
  coins: 0,
  error: null,
}
vi.mock('../../auth/store', () => ({
  authStore: {
    getState: () => authState,
    subscribe: () => () => {},
    signOut: async () => {},
  },
}))

import { lobbyStore } from '../store'
import { LobbyScreen } from '../LobbyScreen'

beforeEach(() => {
  authState = {
    status: 'signedOut',
    userId: null,
    username: null,
    email: null,
    coins: 0,
    error: null,
  }
  lobbyStore.reset()
})

describe('LobbyScreen', () => {
  it('renders the name input when signed out', () => {
    render(<LobbyScreen onBack={() => {}} />)
    expect(screen.getByLabelText(/your name/i)).toBeDefined()
    expect(screen.getByLabelText(/randomise name/i)).toBeDefined()
  })

  it('renders static username text instead of the name input when signed in', () => {
    authState = {
      status: 'signedIn',
      userId: 'u1',
      username: 'Ahsan',
      email: 'a@b.com',
      coins: 5,
      error: null,
    }
    render(<LobbyScreen onBack={() => {}} />)
    expect(screen.queryByLabelText(/your name/i)).toBeNull()
    expect(screen.queryByLabelText(/randomise name/i)).toBeNull()
    expect(screen.getByText('Ahsan')).toBeDefined()
  })
})
