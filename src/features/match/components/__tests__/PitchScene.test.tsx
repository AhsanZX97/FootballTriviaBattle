import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { PitchScene } from '../PitchScene'

function keeperClasses(container: HTMLElement): string {
  return container.querySelector('.scene__keeper')!.className
}

describe('PitchScene keeper skin', () => {
  it("wears my equipped skin when I'm the one in goal (stage keep)", () => {
    const { container } = render(
      <PitchScene stage="keep" feedback={null} gkSkin="gk_coral_guard" opponentGkSkin="gk_orange_blaze" />,
    )
    expect(keeperClasses(container)).toContain('scene__keeper--coralguard')
  })

  it("wears the opponent's equipped skin when I'm shooting (stage shoot)", () => {
    const { container } = render(
      <PitchScene stage="shoot" feedback={null} gkSkin="gk_coral_guard" opponentGkSkin="gk_orange_blaze" />,
    )
    expect(keeperClasses(container)).toContain('scene__keeper--orangeblaze')
  })

  it('falls back to the stock keeper when shooting and the opponent has no skin', () => {
    const { container } = render(<PitchScene stage="shoot" feedback={null} gkSkin="gk_coral_guard" />)
    expect(keeperClasses(container)).not.toContain('scene__keeper--skinned')
  })

  it("falls back to the stock keeper for an opponent's 'default' skin id", () => {
    const { container } = render(
      <PitchScene stage="shoot" feedback={null} opponentGkSkin="default" />,
    )
    expect(keeperClasses(container)).not.toContain('scene__keeper--skinned')
  })
})
