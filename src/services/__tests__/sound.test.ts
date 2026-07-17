import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getMasterVolume,
  setMasterVolume,
  play,
  playGoalCelebration,
  previewGoalSound,
  stopPreview,
  VOLUME_STORAGE_KEY,
} from '../sound'
import { GOAL_SOUND_SOURCES } from '../shopCatalogue'
import cheerSrc from '../../assets/sounds/cheer.mp3'

/** jsdom has no real audio playback, so the sources the service reaches for are
 * observed by standing in for the Audio constructor. */
class FakeAudio {
  src: string
  volume = 1
  paused = false
  play = vi.fn(async () => {})
  pause = vi.fn(() => {
    this.paused = true
  })

  constructor(src: string) {
    this.src = src
    created.push(this)
  }
}

let created: FakeAudio[] = []

// The service debounces repeats of the same sound within 100ms, and its clock
// is module-level — so tests are stepped well apart on a fake clock, otherwise
// two tests playing the same sound in the same millisecond would see the second
// one swallowed.
let clock = 0

beforeEach(() => {
  created = []
  vi.useFakeTimers()
  clock += 10_000
  vi.setSystemTime(clock)
  vi.stubGlobal('Audio', FakeAudio)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('sound service', () => {
  it('clamps master volume to the 0..1 range', () => {
    setMasterVolume(1.7)
    expect(getMasterVolume()).toBe(1)
    setMasterVolume(-2)
    expect(getMasterVolume()).toBe(0)
  })

  it('persists master volume to localStorage', () => {
    setMasterVolume(0.4)
    expect(localStorage.getItem(VOLUME_STORAGE_KEY)).toBe('0.4')
  })

  it('does not throw when playing in an environment without audio playback', () => {
    setMasterVolume(0.5)
    expect(() => play('kick')).not.toThrow()
  })

  it('skips playback entirely when muted', () => {
    setMasterVolume(0)
    expect(() => play('cheer')).not.toThrow()
  })
})

describe('playGoalCelebration', () => {
  it('plays the equipped goal sound', () => {
    setMasterVolume(1)
    playGoalCelebration('siuuuu')
    expect(created).toHaveLength(1)
    expect(created[0].src).toBe(GOAL_SOUND_SOURCES.siuuuu)
  })

  it('falls back to the stock cheer for the default item', () => {
    setMasterVolume(1)
    playGoalCelebration('default')
    expect(created[0].src).toBe(cheerSrc)
  })

  it('falls back to the stock cheer for an id with no bundled audio', () => {
    setMasterVolume(1)
    playGoalCelebration('from_a_newer_build')
    expect(created[0].src).toBe(cheerSrc)
  })

  it('stays silent when muted', () => {
    setMasterVolume(0)
    playGoalCelebration('gooal')
    expect(created).toHaveLength(0)
  })
})

describe('previewGoalSound', () => {
  it('plays the previewed item', () => {
    setMasterVolume(1)
    previewGoalSound('goal_horn')
    expect(created).toHaveLength(1)
    expect(created[0].src).toBe(GOAL_SOUND_SOURCES.goal_horn)
  })

  it('cuts the previous preview off when another item is previewed', () => {
    setMasterVolume(1)
    previewGoalSound('goal_horn')
    previewGoalSound('gooal')
    expect(created[0].pause).toHaveBeenCalled()
    expect(created[1].src).toBe(GOAL_SOUND_SOURCES.gooal)
  })

  it('restarts rather than debouncing when the same item is previewed twice', () => {
    setMasterVolume(1)
    previewGoalSound('siuuuu')
    previewGoalSound('siuuuu')
    expect(created).toHaveLength(2)
    expect(created[0].pause).toHaveBeenCalled()
  })

  it('ignores an id with no bundled audio', () => {
    setMasterVolume(1)
    previewGoalSound('nope')
    expect(created).toHaveLength(0)
  })

  it('stays silent when muted', () => {
    setMasterVolume(0)
    previewGoalSound('siuuuu')
    expect(created).toHaveLength(0)
  })

  it('stopPreview pauses the running preview', () => {
    setMasterVolume(1)
    previewGoalSound('video_game_sound')
    stopPreview()
    expect(created[0].pause).toHaveBeenCalled()
  })

  it('stopPreview is safe when nothing is playing', () => {
    expect(() => stopPreview()).not.toThrow()
  })
})
