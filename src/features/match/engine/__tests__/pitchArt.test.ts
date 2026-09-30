import { describe, expect, it } from 'vitest'
import { resolvePitchArt, pitchLayout } from '../pitchArt'
import { BALL_SKIN_SOURCES, GK_SKIN_SOURCES } from '../../../../services/shopCatalogue'

describe('Phaser pitch art', () => {
  it('selects my keeper when defending and the opponent keeper when shooting', () => {
    const skins = { gkSkin: 'gk_coral_guard', opponentGkSkin: 'gk_orange_blaze' }
    expect(resolvePitchArt({ stage: 'keep', ...skins }).idle.src).toBe(GK_SKIN_SOURCES.gk_coral_guard.idle)
    expect(resolvePitchArt({ stage: 'shoot', ...skins }).idle.src).toBe(GK_SKIN_SOURCES.gk_orange_blaze.idle)
  })

  it.each([undefined, 'default', 'missing'])('uses stock art for unknown opponent keeper %s', (opponentGkSkin) => {
    const art = resolvePitchArt({ stage: 'shoot', gkSkin: 'gk_coral_guard', opponentGkSkin })
    expect(art.idle.src).toContain('gk-idle-strip.png')
    expect(art.idle.columns).toBe(16)
  })

  it('preserves all frames of the differing keeper grids and dive strips', () => {
    const green = resolvePitchArt({ stage: 'keep', gkSkin: 'gk_green_wall' })
    expect([green.idle.columns, green.idle.rows, green.dive.columns]).toEqual([4, 3, 6])
    const gold = resolvePitchArt({ stage: 'keep', gkSkin: 'gk_gold_standard' })
    expect([gold.idle.columns, gold.idle.rows, gold.dive.columns]).toEqual([4, 4, 5])
  })

  it('uses the equipped ball and its four spin frames, or stock fallback', () => {
    const ball = resolvePitchArt({ stage: 'shoot', ballSkin: 'ball_gold_trim' })
    expect(ball.ball.src).toBe(BALL_SKIN_SOURCES.ball_gold_trim.thumb)
    expect([ball.spin.columns, ball.spin.rows]).toEqual([2, 2])
    expect(resolvePitchArt({ stage: 'shoot', ballSkin: 'missing' }).spin.columns).toBe(4)
  })

  it.each([[390, 844], [844, 390], [360, 640], [360, 800], [800, 1280]])('covers the width without stretching at %s x %s', (width, height) => {
    const layout = pitchLayout(width, height)
    expect(layout.x).toBeLessThanOrEqual(0)
    expect(layout.x + layout.width).toBeGreaterThanOrEqual(width)
    expect(layout.width / layout.height).toBeCloseTo(16 / 9)
  })

  // Posts sit at 35.2% and 66.7% of the stadium art.
  it.each([[390, 844], [360, 640], [360, 800], [412, 915], [800, 1280]])('shows both goal posts on a %s x %s portrait screen', (width, height) => {
    const layout = pitchLayout(width, height)
    expect(layout.x + 0.352 * layout.width).toBeGreaterThan(0)
    expect(layout.x + 0.667 * layout.width).toBeLessThan(width)
    expect(layout.x + 0.5 * layout.width).toBeCloseTo(width / 2)
  })

  it('centres the stadium vertically when it is shorter than a tall phone', () => {
    const layout = pitchLayout(390, 844)
    expect(layout.height).toBeLessThan(844)
    expect(layout.y).toBeCloseTo((844 - layout.height) / 2)
  })

  it('still fills a landscape screen edge to edge', () => {
    const layout = pitchLayout(844, 390)
    expect(layout.y).toBeLessThanOrEqual(0)
    expect(layout.y + layout.height).toBeGreaterThanOrEqual(390)
  })
})
