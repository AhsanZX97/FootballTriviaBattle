import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { createLevelStore } from '../store'
import { LevelScreen } from '../LevelScreen'

function makeStore() {
  const data: Record<string, string> = {}
  return createLevelStore({
    api: { claimQuestion: vi.fn(async () => null) },
    auth: { getState: () => ({ status: 'signedOut' }), applyCoinsUpdate: vi.fn() },
    progress: { addCoins: vi.fn() },
    storage: {
      getItem: (k) => data[k] ?? null,
      setItem: (k, v) => void (data[k] = v),
      removeItem: (k) => void delete data[k],
    },
  })
}

describe('LevelScreen', () => {
  it('shows the level title, its progress and one card per question', () => {
    render(<LevelScreen level={1} store={makeStore()} onBack={() => {}} onOpen={() => {}} />)

    expect(screen.getByRole('img', { name: 'LEVEL 1' })).toBeDefined()
    expect(screen.getByRole('heading', { name: 'SUNDAY LEAGUE' })).toBeDefined()
    expect(screen.getByText('0/1')).toBeDefined()
    expect(screen.getAllByRole('button', { name: /^question \d+/i })).toHaveLength(1)
  })

  it('opens the tapped card', () => {
    const onOpen = vi.fn()
    render(<LevelScreen level={1} store={makeStore()} onBack={() => {}} onOpen={onOpen} />)

    fireEvent.click(screen.getByRole('button', { name: 'Question 1' }))
    expect(onOpen).toHaveBeenCalledWith('wc-1')
  })

  it('marks a solved card and counts it', async () => {
    const store = makeStore()
    await store.answer('wc-1', 'Brazil')
    render(<LevelScreen level={1} store={store} onBack={() => {}} onOpen={() => {}} />)

    expect(screen.getByRole('button', { name: 'Question 1, solved' })).toBeDefined()
    expect(screen.getByText('1/1')).toBeDefined()
  })

  it('goes back', () => {
    const onBack = vi.fn()
    render(<LevelScreen level={1} store={makeStore()} onBack={onBack} onOpen={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(onBack).toHaveBeenCalled()
  })
})
