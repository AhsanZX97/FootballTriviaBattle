import { describe, expect, it } from 'vitest'
import { createDevMode, devModeAvailable } from '../devMode'

function memoryStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
}

describe('devModeAvailable', () => {
  it('is only true on a loopback host', () => {
    expect(devModeAvailable('localhost')).toBe(true)
    expect(devModeAvailable('127.0.0.1')).toBe(true)
    expect(devModeAvailable('footballtriviabattle.com')).toBe(false)
    expect(devModeAvailable('192.168.1.20')).toBe(false)
    expect(devModeAvailable('')).toBe(false)
  })
})

describe('createDevMode', () => {
  it('starts off, and switches on and off', () => {
    const dev = createDevMode({ available: () => true, storage: memoryStorage() })
    expect(dev.isOn()).toBe(false)
    dev.setOn(true)
    expect(dev.isOn()).toBe(true)
    dev.setOn(false)
    expect(dev.isOn()).toBe(false)
  })

  it('remembers the setting across loads', () => {
    const storage = memoryStorage()
    createDevMode({ available: () => true, storage }).setOn(true)
    expect(createDevMode({ available: () => true, storage }).isOn()).toBe(true)
  })

  it('can never be switched on where it is unavailable, even with the flag in storage', () => {
    const storage = memoryStorage()
    storage.setItem('ftb.devMode', '1')
    const dev = createDevMode({ available: () => false, storage })
    expect(dev.isOn()).toBe(false)
    dev.setOn(true)
    expect(dev.isOn()).toBe(false)
  })

  it('notifies subscribers on change only', () => {
    const dev = createDevMode({ available: () => true, storage: memoryStorage() })
    let calls = 0
    dev.subscribe(() => calls++)
    dev.setOn(true)
    dev.setOn(true)
    dev.setOn(false)
    expect(calls).toBe(2)
  })
})
