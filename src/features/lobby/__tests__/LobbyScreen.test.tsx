import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import type { AuthState } from '../../../types/auth'
import { defaultCustomization } from '../../../types/customization'

const signedOutState = (): AuthState => ({
  status: 'signedOut',
  userId: null,
  username: null,
  email: null,
  coins: 0,
  customization: defaultCustomization(),
  dailyRewardStreak: 0,
  lastDailyRewardDate: null,
  isPlayGamesAccount: false,
  error: null,
})

let authState: AuthState = signedOutState()
const renameUsername = vi.fn(async (_next: string) => true)
const clearError = vi.fn()
vi.mock('../../auth/store', () => ({
  authStore: {
    getState: () => authState,
    subscribe: () => () => {},
    signOut: async () => {},
    renameUsername: (next: string) => renameUsername(next),
    clearError: () => clearError(),
  },
}))

import { lobbyStore } from '../store'
import { LobbyScreen } from '../LobbyScreen'

const signedInState = (username = 'Ahsan'): AuthState => ({
  ...signedOutState(),
  status: 'signedIn',
  userId: 'u1',
  username,
  email: 'a@b.com',
  coins: 5,
})

beforeEach(() => {
  authState = signedOutState()
  renameUsername.mockClear()
  renameUsername.mockResolvedValue(true)
  clearError.mockClear()
  lobbyStore.reset()
})

describe('LobbyScreen', () => {
  it('renders the name input when signed out', () => {
    render(<LobbyScreen onBack={() => {}} />)
    expect(screen.getByLabelText(/your name/i)).toBeDefined()
    expect(screen.getByLabelText(/randomise name/i)).toBeDefined()
  })

  it('renders static username text instead of the name input when signed in', () => {
    authState = signedInState()
    render(<LobbyScreen onBack={() => {}} />)
    expect(screen.queryByLabelText(/your name/i)).toBeNull()
    expect(screen.queryByLabelText(/randomise name/i)).toBeNull()
    expect(screen.getByText('Ahsan')).toBeDefined()
  })
})

describe('LobbyScreen rename', () => {
  function openEditor() {
    fireEvent.click(screen.getByRole('button', { name: /rename/i }))
  }

  it('swaps the username for an editor when RENAME is pressed', () => {
    authState = signedInState()
    render(<LobbyScreen onBack={() => {}} />)

    openEditor()

    expect(screen.getByLabelText(/new username/i)).toBeDefined()
    expect(screen.queryByText('Ahsan')).toBeNull()
  })

  it('sends the edited name to the auth store and closes on success', async () => {
    authState = signedInState()
    render(<LobbyScreen onBack={() => {}} />)
    openEditor()

    fireEvent.change(screen.getByLabelText(/new username/i), { target: { value: 'Ahsan2' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    })

    expect(renameUsername).toHaveBeenCalledWith('Ahsan2')
    expect(screen.queryByLabelText(/new username/i)).toBeNull()
    expect(screen.getByText('Ahsan')).toBeDefined()
  })

  it('keeps the editor open when the rename is rejected', async () => {
    authState = signedInState()
    renameUsername.mockResolvedValue(false)
    render(<LobbyScreen onBack={() => {}} />)
    openEditor()

    fireEvent.change(screen.getByLabelText(/new username/i), { target: { value: 'taken' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    })

    expect(screen.getByLabelText(/new username/i)).toBeDefined()
  })

  it('restores the username display on cancel without renaming', () => {
    authState = signedInState()
    render(<LobbyScreen onBack={() => {}} />)
    openEditor()

    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))

    expect(screen.getByText('Ahsan')).toBeDefined()
    expect(renameUsername).not.toHaveBeenCalled()
    expect(clearError).toHaveBeenCalled()
  })
})
