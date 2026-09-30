import { StrictMode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PitchScene } from '../PitchScene'

const engine = vi.hoisted(() => ({
  update: vi.fn(), destroy: vi.fn(), create: vi.fn(), load: vi.fn(),
}))
vi.mock('../../engine/loadPitchGame', () => ({ loadPitchGame: engine.load }))

beforeEach(() => {
  vi.clearAllMocks()
  engine.create.mockReturnValue({ update: engine.update, destroy: engine.destroy })
  engine.load.mockResolvedValue({ createPitchGame: engine.create })
})

describe('Phaser canvas lifecycle', () => {
  it('creates one engine and updates it when the shot changes', async () => {
    const { rerender, unmount } = render(<PitchScene stage="shoot" feedback={null} />)
    await waitFor(() => expect(engine.create).toHaveBeenCalledOnce())
    rerender(<PitchScene stage="keep" feedback="save" />)
    expect(engine.create).toHaveBeenCalledOnce()
    expect(engine.update).toHaveBeenLastCalledWith(expect.objectContaining({ stage: 'keep', feedback: 'save' }))
    unmount()
    expect(engine.destroy).toHaveBeenCalledOnce()
  })

  it('does not create a canvas when its lazy import resolves after unmount', async () => {
    let resolve!: (value: { createPitchGame: typeof engine.create }) => void
    engine.load.mockReturnValue(new Promise((done) => { resolve = done }))
    const { unmount } = render(<PitchScene stage="shoot" feedback={null} />)
    unmount()
    await act(async () => resolve({ createPitchGame: engine.create }))
    expect(engine.create).not.toHaveBeenCalled()
  })

  it('uses the latest state if a shot arrives while Phaser loads', async () => {
    let resolve!: (value: { createPitchGame: typeof engine.create }) => void
    engine.load.mockReturnValue(new Promise((done) => { resolve = done }))
    const { rerender } = render(<PitchScene stage="shoot" feedback={null} />)
    rerender(<PitchScene stage="shoot" feedback="goal" />)
    await act(async () => resolve({ createPitchGame: engine.create }))
    expect(engine.create).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ feedback: 'goal' }), expect.any(Object))
  })

  it('only creates one live engine under React StrictMode', async () => {
    const { unmount } = render(<StrictMode><PitchScene stage="shoot" feedback={null} /></StrictMode>)
    await waitFor(() => expect(engine.create).toHaveBeenCalledOnce())
    unmount()
    expect(engine.destroy).toHaveBeenCalledOnce()
  })

  it('offers a retry after an engine import failure', async () => {
    engine.load.mockRejectedValueOnce(new Error('offline chunk'))
    render(<PitchScene stage="shoot" feedback={null} />)
    fireEvent.click(await screen.findByRole('button', { name: /retry pitch/i }))
    await waitFor(() => expect(engine.create).toHaveBeenCalledOnce())
  })
})
