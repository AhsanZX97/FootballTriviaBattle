import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PitchState } from '../contracts'

// A renderer boundary: tests drive the actual scene loop, with GPU objects replaced
// by a small display list. Browser verification separately exercises real Phaser.
const harness = vi.hoisted(() => {
  const objects: any[] = []
  const textures = new Map<string, any>()
  function object(x: number, y: number, key?: string) {
    const value: any = { x, y, key, visible: true, alpha: 1, width: 100, height: 100 }
    for (const method of ['setOrigin', 'setDepth', 'setScrollFactor', 'setStroke', 'setShadow']) {
      value[method] = () => value
    }
    value.setPosition = (x: number, y: number) => Object.assign(value, { x, y })
    value.setDisplaySize = (width: number, height: number) => Object.assign(value, { displayWidth: width, displayHeight: height })
    value.setTexture = (key: string, frame: number) => Object.assign(value, { key, frame })
    value.setVisible = (visible: boolean) => Object.assign(value, { visible })
    value.setAlpha = (alpha: number) => Object.assign(value, { alpha })
    value.setFlipX = (flipX: boolean) => Object.assign(value, { flipX })
    value.setText = (text: string) => Object.assign(value, { text })
    value.setFontSize = () => value
    value.setScale = () => value
    objects.push(value)
    return value
  }
  let scene: any
  let config: any
  const destroy = vi.fn()
  class Scene {
    add = { image: object, sprite: object, text: object, rectangle: object }
    scale = { width: 844, height: 390 }
    textures = {
      exists: (key: string) => textures.has(key),
      get: (key: string) => textures.get(key),
    }
    load = {
      image: (key: string) => textures.set(key, {
        getSourceImage: () => ({ width: 1600, height: 100 }),
        has: () => false,
        add: vi.fn(),
      }),
      on: vi.fn(),
    }
  }
  class Game {
    constructor(options: any) {
      config = options
      scene = options.scene[0]
      scene.preload()
      scene.create()
    }
    destroy = destroy
  }
  return { objects, textures, Scene, Game, destroy, getScene: () => scene, getConfig: () => config }
})

vi.mock('phaser', () => ({ default: { Scene: harness.Scene, Game: harness.Game, AUTO: 0, Scale: { RESIZE: 5 } } }))
import { createPitchGame } from '../createPitchGame'

const state: PitchState = { stage: 'shoot', feedback: null, label: null, dimmed: false }

beforeEach(() => {
  harness.objects.length = 0
  harness.textures.clear()
  harness.destroy.mockClear()
})

describe('Phaser match renderer', () => {
  it('creates a pixel-art engine with native input left to the existing UI', () => {
    const onReady = vi.fn()
    createPitchGame(document.createElement('div'), state, { onEvent: vi.fn(), onReady, onError: vi.fn() })
    expect(harness.getConfig()).toMatchObject({ pixelArt: true, audio: { noAudio: true }, scale: { mode: 5 } })
    expect(onReady).toHaveBeenCalledOnce()
    expect(harness.objects.length).toBeGreaterThanOrEqual(4)
  })

  it('moves the ball, reveals the outcome at impact, and emits completion once', () => {
    const onEvent = vi.fn()
    const game = createPitchGame(document.createElement('div'), state, { onEvent, onReady: vi.fn(), onError: vi.fn() })
    game.update({ ...state, feedback: 'save', label: 'SAVED!' })
    const scene = harness.getScene()
    expect(scene).toBeDefined()
    scene.update(0, 999)
    expect(onEvent).not.toHaveBeenCalled()
    scene.update(0, 1)
    expect(onEvent).toHaveBeenLastCalledWith('kick', 'save')
    scene.update(0, 500)
    expect(onEvent).toHaveBeenLastCalledWith('impact', 'save')
    expect(harness.objects.find((o) => o.text === 'SAVED!')?.visible).toBe(true)
    const ball = harness.objects.find((o) => o.key?.includes('ball-spin'))
    expect(ball?.x).toBeLessThan(422)
    scene.update(0, 1100)
    scene.update(0, 1000)
    expect(onEvent.mock.calls).toEqual([['kick', 'save'], ['impact', 'save'], ['complete', 'save']])
  })

  it('does not restart a shot when only the label changes', () => {
    const onEvent = vi.fn()
    const game = createPitchGame(document.createElement('div'), state, { onEvent, onReady: vi.fn(), onError: vi.fn() })
    game.update({ ...state, feedback: 'goal', label: 'GOAL!' })
    expect(harness.getScene()).toBeDefined()
    harness.getScene().update(0, 1000)
    game.update({ ...state, feedback: 'goal', label: 'Goal!' })
    harness.getScene().update(0, 1600)
    expect(onEvent.mock.calls.filter(([event]) => event === 'kick')).toHaveLength(1)
    expect(onEvent).toHaveBeenLastCalledWith('complete', 'goal')
  })

  it('cancels callbacks and removes the canvas on destroy', () => {
    const onEvent = vi.fn()
    const game = createPitchGame(document.createElement('div'), { ...state, feedback: 'goal' }, { onEvent, onReady: vi.fn(), onError: vi.fn() })
    game.destroy()
    expect(harness.destroy).toHaveBeenCalledWith(true)
    harness.getScene().update(0, 3000)
    expect(onEvent).not.toHaveBeenCalled()
  })
})
