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

const emptyLevels = () => ({
  solved: {} as Record<string, number>,
  tries: {} as Record<string, number>,
  prizes: [] as number[],
})
let levelState = emptyLevels()
vi.mock('../../levels/store', () => ({
  levelStore: {
    getState: () => levelState,
    subscribe: () => () => {},
  },
}))

import { LEVELS } from '../../../game/levels/manifest'
import { IntroScreen } from '../IntroScreen'

beforeEach(() => {
  authState = signedOut()
  localProgress = { coins: 0, matches: [] }
  levelState = emptyLevels()
  signOut.mockClear()
  clearWelcomeNotice.mockClear()
})

describe('IntroScreen', () => {
  it('offers Play vs Human, the level list, Shop and Sign In', () => {
    render(<IntroScreen />)
    expect(screen.getByRole('button', { name: /play vs human/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /^level 1,/i })).toBeDefined()
    expect(screen.getAllByRole('button')).toHaveLength(4)
    expect(screen.queryByRole('button', { name: /cpu/i })).toBeNull()
  })

  it('calls onPlayNow when Play vs Human is clicked', () => {
    const onPlayNow = vi.fn()
    render(<IntroScreen onPlayNow={onPlayNow} />)
    fireEvent.click(screen.getByRole('button', { name: /play vs human/i }))
    expect(onPlayNow).toHaveBeenCalled()
  })

  it('shows Level 1 progress and prize, and opens it', () => {
    const onOpenLevel = vi.fn()
    render(<IntroScreen onOpenLevel={onOpenLevel} />)
    const row = screen.getByRole('button', { name: 'Level 1, 0 of 24 solved. Prize: goal + horn' })
    expect(screen.getByText('SUNDAY LEAGUE')).toBeDefined()
    fireEvent.click(row)
    expect(onOpenLevel).toHaveBeenCalledWith(1)
  })

  it('shows later levels locked, with the solve count each one needs', () => {
    render(<IntroScreen />)
    const locked = screen.getByRole('group', { name: 'Level 2, locked' })
    expect(screen.getByText('ACADEMY')).toBeDefined()
    expect(screen.getByText('NEEDS 18 SOLVED')).toBeDefined()
    expect(screen.getByText('NEEDS 36 SOLVED')).toBeDefined()
    expect(locked.querySelector('img')?.getAttribute('src')).toMatch(/chest-closed/)
    expect(screen.queryByRole('button', { name: /level 2/i })).toBeNull()
    expect(screen.getAllByRole('group', { name: /locked/i })).toHaveLength(LEVELS.length - 1)
  })

  it('opens Level 2 once 18 questions are solved, chest and all', () => {
    const onOpenLevel = vi.fn()
    levelState = {
      solved: Object.fromEntries(Array.from({ length: 18 }, (_, i) => [`q${i}`, 0])),
      tries: {},
      prizes: [],
    }
    render(<IntroScreen onOpenLevel={onOpenLevel} />)
    const row = screen.getByRole('button', { name: 'Level 2, 0 of 24 solved. Prize: 50 coins' })
    expect(row.querySelector('img')?.getAttribute('src')).toMatch(/chest-closed/)
    fireEvent.click(row)
    expect(onOpenLevel).toHaveBeenCalledWith(2)
    expect(screen.getByRole('group', { name: 'Level 3, locked' })).toBeDefined()
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

  it('offers the dev test mode only when the app wires it up', () => {
    const onTestMode = vi.fn()
    const { unmount } = render(<IntroScreen />)
    expect(screen.queryByRole('button', { name: /test mode/i })).toBeNull()
    unmount()
    render(<IntroScreen onTestMode={onTestMode} />)
    fireEvent.click(screen.getByRole('button', { name: /test mode/i }))
    expect(onTestMode).toHaveBeenCalled()
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
    // Play vs Human, Level 1 and Shop are the whole menu for these players.
    expect(screen.getAllByRole('button')).toHaveLength(3)
  })

  it('still offers Sign Out to an ordinary email account', () => {
    authState = { ...playGamesState(), email: 'bob@example.com', isPlayGamesAccount: false }
    render(<IntroScreen />)

    expect(screen.getByRole('button', { name: /sign out/i })).toBeDefined()
  })
})

describe('IntroScreen — on-device progress', () => {
  it('shows no coins-earned banner or levels heading', () => {
    localProgress = { coins: 47, matches: [] }
    render(<IntroScreen />)

    expect(screen.queryByText(/COINS EARNED/i)).toBeNull()
    expect(screen.queryByText('LEVELS')).toBeNull()
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
