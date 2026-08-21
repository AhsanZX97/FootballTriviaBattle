import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { AuthState } from '../../../types/auth'
import { defaultCustomization } from '../../../types/customization'

const signedOut = (): AuthState => ({
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
})

let authState: AuthState = signedOut()
const signOut = vi.fn(async () => {})
const clearWelcomeNotice = vi.fn()
vi.mock('../../auth/store', () => ({
  authStore: {
    getState: () => authState,
    subscribe: () => () => {},
    signOut: () => signOut(),
    clearWelcomeNotice: () => clearWelcomeNotice(),
  },
}))

// getState must return a stable reference — useSyncExternalStore treats a new
// object as a new snapshot and re-renders forever. The real store only swaps
// this object on an actual change, so the mock has to behave the same way.
let localProgress = { coins: 0, matches: [] }
vi.mock('../../progress/store', () => ({
  localProgressStore: {
    getState: () => localProgress,
    subscribe: () => () => {},
  },
}))

import { IntroScreen } from '../IntroScreen'

beforeEach(() => {
  authState = signedOut()
  localProgress = { coins: 0, matches: [] }
  signOut.mockClear()
  clearWelcomeNotice.mockClear()
})

describe('IntroScreen', () => {
  it('offers Play Now as the only way into a match', () => {
    render(<IntroScreen />)
    expect(screen.getByRole('button', { name: /play now/i })).toBeDefined()
    // 1 v CPU is gone: Play Now, Shop and Sign In are the whole menu
    expect(screen.getAllByRole('button')).toHaveLength(3)
    expect(screen.queryByRole('button', { name: /cpu/i })).toBeNull()
  })

  it('calls onPlayNow when Play Now is clicked', () => {
    const onPlayNow = vi.fn()
    render(<IntroScreen onPlayNow={onPlayNow} />)
    fireEvent.click(screen.getByRole('button', { name: /play now/i }))
    expect(onPlayNow).toHaveBeenCalled()
  })

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
      ...signedOut(),
      status: 'signedIn',
      userId: 'u1',
      username: 'Ahsan',
      email: 'a@b.com',
      coins: 5,
    }
    render(<IntroScreen />)
    expect(screen.getByRole('button', { name: /sign out/i })).toBeDefined()
    expect(screen.queryByRole('button', { name: /^sign in$/i })).toBeNull()
  })

  it('calls authStore.signOut when Sign Out is clicked', () => {
    authState = {
      ...signedOut(),
      status: 'signedIn',
      userId: 'u1',
      username: 'Ahsan',
      email: 'a@b.com',
      coins: 5,
    }
    render(<IntroScreen />)
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }))
    expect(signOut).toHaveBeenCalled()
  })

  it('calls onShop when the Shop button is clicked', () => {
    const onShop = vi.fn()
    render(<IntroScreen onShop={onShop} />)
    const shopButton = screen.getByRole('button', { name: /shop/i })
    expect(shopButton.hasAttribute('disabled')).toBe(false)
    fireEvent.click(shopButton)
    expect(onShop).toHaveBeenCalled()
  })
})

describe('IntroScreen with a Play Games account', () => {
  const playGamesState = (): AuthState => ({
    ...signedOut(),
    status: 'signedIn',
    userId: 'u1',
    username: 'AhsanDeGreat',
    email: 'pgs-a_123@players.invalid',
    isPlayGamesAccount: true,
  })

  it('offers neither Sign Out nor Sign In', () => {
    authState = playGamesState()
    render(<IntroScreen />)

    expect(screen.queryByRole('button', { name: /sign out/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /sign in/i })).toBeNull()
    // Play Now and Shop are the whole menu for these players.
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  it('still offers Sign Out to an ordinary email account', () => {
    authState = { ...playGamesState(), email: 'bob@example.com', isPlayGamesAccount: false }
    render(<IntroScreen />)

    expect(screen.getByRole('button', { name: /sign out/i })).toBeDefined()
  })
})

describe('IntroScreen — on-device progress', () => {
  it('tells a signed-out player what they have earned and how to keep it', () => {
    localProgress = { coins: 47, matches: [] }
    render(<IntroScreen />)

    expect(screen.getByText(/47 COINS EARNED/i)).toBeDefined()
    expect(screen.getByText(/sign in to save them/i)).toBeDefined()
  })

  it('stays quiet when the player has earned nothing yet', () => {
    localProgress = { coins: 0, matches: [] }
    render(<IntroScreen />)

    expect(screen.queryByText(/COINS EARNED/i)).toBeNull()
  })

  it('stays quiet while the session is still resolving', () => {
    // Play Games may be about to sign this player in — promising them a
    // sign-in prompt they will never see would be a lie.
    localProgress = { coins: 47, matches: [] }
    authState = { ...signedOut(), status: 'loading' }
    render(<IntroScreen />)

    expect(screen.queryByText(/COINS EARNED/i)).toBeNull()
  })

  it('announces the welcome coins once signed in, and dismisses on tap', () => {
    authState = { ...signedOut(), status: 'signedIn', userId: 'u1', welcomeCoins: 42 }
    render(<IntroScreen />)

    const notice = screen.getByRole('button', { name: /\+42 COINS/i })
    fireEvent.click(notice)
    expect(clearWelcomeNotice).toHaveBeenCalled()
  })

  it('shows no notice when there were no welcome coins', () => {
    authState = { ...signedOut(), status: 'signedIn', userId: 'u1', welcomeCoins: null }
    render(<IntroScreen />)

    expect(screen.queryByRole('button', { name: /\+\d+ COINS/i })).toBeNull()
  })
})
