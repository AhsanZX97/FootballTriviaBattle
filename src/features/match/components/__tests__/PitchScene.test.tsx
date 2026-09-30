import { describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { PitchScene } from '../PitchScene'
import { resolvePitchArt } from '../../engine/pitchArt'
import type { PitchState } from '../../engine/contracts'

const engine = vi.hoisted(() => ({ create: vi.fn(() => ({ update: vi.fn(), destroy: vi.fn() })) }))
vi.mock('../../engine/loadPitchGame', () => ({ loadPitchGame: async () => ({ createPitchGame: engine.create }) }))

async function keeperSource(): Promise<string> {
  await waitFor(() => expect(engine.create).toHaveBeenCalled())
  const state = (engine.create.mock.calls.at(-1) as unknown as [HTMLElement, PitchState])[1]
  engine.create.mockClear()
  return resolvePitchArt(state).idle.src
}

describe('PitchScene keeper skin', () => {
  it("wears my equipped skin when I'm the one in goal (stage keep)", async () => {
    render(
      <PitchScene stage="keep" feedback={null} gkSkin="gk_coral_guard" opponentGkSkin="gk_orange_blaze" />,
    )
    expect(await keeperSource()).toContain('coral-guard.png')
  })

  it("wears the opponent's equipped skin when I'm shooting (stage shoot)", async () => {
    render(
      <PitchScene stage="shoot" feedback={null} gkSkin="gk_coral_guard" opponentGkSkin="gk_orange_blaze" />,
    )
    expect(await keeperSource()).toContain('orange-blaze.png')
  })

  it('falls back to the stock keeper when shooting and the opponent has no skin', async () => {
    render(<PitchScene stage="shoot" feedback={null} gkSkin="gk_coral_guard" />)
    expect(await keeperSource()).toContain('gk-idle-strip.png')
  })

  it("falls back to the stock keeper for an opponent's 'default' skin id", async () => {
    render(
      <PitchScene stage="shoot" feedback={null} opponentGkSkin="default" />,
    )
    expect(await keeperSource()).toContain('gk-idle-strip.png')
  })
})
