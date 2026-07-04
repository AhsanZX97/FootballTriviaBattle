import { getMasterVolume, setMasterVolume, play, VOLUME_STORAGE_KEY } from '../sound'

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
