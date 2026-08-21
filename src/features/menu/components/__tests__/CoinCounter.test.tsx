import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { AuthState } from '../../../../types/auth'
import { defaultCustomization } from '../../../../types/customization'
import type { AuthStore } from '../../../auth/store'
import { createLocalProgressStore } from '../../../progress/store'
import { CoinCounter } from '../CoinCounter'

/** A real progress store over throwaway storage — simpler and truer than
 * hand-rolling a fake with the same seven methods. */
function createProgress(coins = 0) {
  const data = new Map<string, string>()
  const store = createLocalProgressStore({
    storage: {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
      removeItem: (k) => void data.delete(k),
    },
    api: { claimLocalProgress: async () => null },
  })
  if (coins > 0) store.addCoins(coins)
  return store
}

function createFakeStore(state: AuthState): AuthStore {
  return {
    getState: () => state,
    subscribe: () => () => {},
    signIn: async () => {},
    signUp: async () => {},
    signOut: async () => {},
    renameUsername: async () => true,
    clearError: () => {},
    clearWelcomeNotice: () => {},
    applyCoinsUpdate: () => {},
    claimDailyReward: async () => null,
    applyCustomizationUpdate: () => {},
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
  customization: defaultCustomization(),
  dailyRewardStreak: 0,
  lastDailyRewardDate: null,
  isPlayGamesAccount: false,
  welcomeCoins: null,
  error: null,
}

describe('CoinCounter', () => {
  it('shows 0 when signed out with nothing earned on this device', () => {
    render(<CoinCounter store={createFakeStore(signedOut)} progress={createProgress()} />)
    expect(screen.getByText('0')).toBeDefined()
  })

  it('shows on-device coins when signed out, not a flat 0', () => {
    render(<CoinCounter store={createFakeStore(signedOut)} progress={createProgress(17)} />)
    expect(screen.getByText('17')).toBeDefined()
  })

  it('shows 0 while still loading, trusting neither balance yet', () => {
    render(
      <CoinCounter
        store={createFakeStore({ ...signedOut, status: 'loading', coins: 42 })}
        progress={createProgress(17)}
      />,
    )
    expect(screen.getByText('0')).toBeDefined()
  })

  it('shows the account balance when signed in, ignoring stale local progress', () => {
    render(
      <CoinCounter
        store={createFakeStore({
          ...signedOut,
          status: 'signedIn',
          userId: 'u1',
          username: 'Ahsan',
          email: 'a@b.com',
          coins: 42,
        })}
        progress={createProgress(17)}
      />,
    )
    expect(screen.getByText('42')).toBeDefined()
  })
})
