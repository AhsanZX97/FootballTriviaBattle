import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnalyticsSink } from '../../types/analytics'
import {
  BUFFER_LIMIT,
  DEFAULT_POSTHOG_HOST,
  INSTALL_ID_KEY,
  createAnalytics,
  getInstallId,
  resolveAnalytics,
} from '../analytics'

function fakeStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed))
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  }
}

function fakeSink(): AnalyticsSink & {
  captured: Array<{ name: string; props?: Record<string, unknown> }>
  identified: string[]
  resets: number
} {
  const captured: Array<{ name: string; props?: Record<string, unknown> }> = []
  const identified: string[] = []
  let resets = 0
  return {
    captured,
    identified,
    get resets() {
      return resets
    },
    capture: (name, props) => void captured.push({ name, props }),
    identify: (id) => void identified.push(id),
    reset: () => void (resets += 1),
  }
}

describe('resolveAnalytics', () => {
  it('is enabled with the given host when both env vars are set', () => {
    expect(resolveAnalytics('phc_abc123', 'https://eu.i.posthog.com')).toEqual({
      enabled: true,
      key: 'phc_abc123',
      host: 'https://eu.i.posthog.com',
    })
  })

  it('falls back to the default host when only the key is set', () => {
    expect(resolveAnalytics('phc_abc123', undefined)).toEqual({
      enabled: true,
      key: 'phc_abc123',
      host: DEFAULT_POSTHOG_HOST,
    })
  })

  it('is disabled when the key is undefined', () => {
    expect(resolveAnalytics(undefined, undefined).enabled).toBe(false)
  })

  it('treats an empty or whitespace key as unset', () => {
    expect(resolveAnalytics('', undefined).enabled).toBe(false)
    expect(resolveAnalytics('   ', undefined).enabled).toBe(false)
  })
})

describe('createAnalytics', () => {
  let sink: ReturnType<typeof fakeSink>

  beforeEach(() => {
    sink = fakeSink()
  })

  it('sends an event straight through once a sink is attached', () => {
    const a = createAnalytics()
    a.attach(sink)
    a.track('app_open', { native: true })

    expect(sink.captured).toEqual([{ name: 'app_open', props: { native: true } }])
  })

  it('buffers events fired before attach and flushes them in order', () => {
    const a = createAnalytics()
    a.track('app_open', { native: false })
    a.track('match_start', { mode: 'cpu' })

    expect(sink.captured).toHaveLength(0)

    a.attach(sink)

    expect(sink.captured.map((e) => e.name)).toEqual(['app_open', 'match_start'])
  })

  it('drops the oldest buffered events past the cap so a never-attached sink cannot leak', () => {
    const a = createAnalytics()
    for (let i = 0; i < BUFFER_LIMIT + 10; i += 1) {
      a.track('shop_opened', { coins: i })
    }
    a.attach(sink)

    expect(sink.captured).toHaveLength(BUFFER_LIMIT)
    // Oldest ten dropped, so the first surviving event is the tenth fired.
    expect(sink.captured[0]?.props).toEqual({ coins: 10 })
  })

  it('buffers identify calls made before attach', () => {
    const a = createAnalytics()
    a.identify('user-1')
    a.attach(sink)

    expect(sink.identified).toEqual(['user-1'])
  })

  it('forwards identify and reset once attached', () => {
    const a = createAnalytics()
    a.attach(sink)
    a.identify('user-2')
    a.reset()

    expect(sink.identified).toEqual(['user-2'])
    expect(sink.resets).toBe(1)
  })

  it('never throws when the sink throws', () => {
    const exploding: AnalyticsSink = {
      capture: () => {
        throw new Error('network down')
      },
      identify: () => {
        throw new Error('network down')
      },
      reset: () => {
        throw new Error('network down')
      },
    }
    const a = createAnalytics()
    a.attach(exploding)

    expect(() => a.track('app_open', { native: true })).not.toThrow()
    expect(() => a.identify('user-3')).not.toThrow()
    expect(() => a.reset()).not.toThrow()
  })

  it('never throws when a buffered event fails on flush', () => {
    const exploding: AnalyticsSink = {
      capture: () => {
        throw new Error('network down')
      },
      identify: () => {},
      reset: () => {},
    }
    const a = createAnalytics()
    a.track('app_open', { native: true })

    expect(() => a.attach(exploding)).not.toThrow()
  })

  it('ignores a second attach so events are never double-counted', () => {
    const a = createAnalytics()
    const second = fakeSink()
    a.attach(sink)
    a.attach(second)
    a.track('app_open', { native: true })

    expect(sink.captured).toHaveLength(1)
    expect(second.captured).toHaveLength(0)
  })

  it('discards events entirely when disabled', () => {
    const a = createAnalytics({ disabled: true })
    a.track('app_open', { native: true })
    a.attach(sink)

    expect(sink.captured).toHaveLength(0)
  })
})

describe('getInstallId', () => {
  it('returns the stored id when one already exists', () => {
    const storage = fakeStorage({ [INSTALL_ID_KEY]: 'existing-id' })

    expect(getInstallId(storage)).toBe('existing-id')
  })

  it('generates and persists an id on first run', () => {
    const storage = fakeStorage()
    const id = getInstallId(storage)

    expect(id).toMatch(/^[0-9a-f-]{36}$/i)
    expect(storage.map.get(INSTALL_ID_KEY)).toBe(id)
  })

  it('is stable across calls so retention is not split by a regenerated id', () => {
    const storage = fakeStorage()

    expect(getInstallId(storage)).toBe(getInstallId(storage))
  })

  it('treats a blank stored value as absent and regenerates', () => {
    const storage = fakeStorage({ [INSTALL_ID_KEY]: '   ' })
    const id = getInstallId(storage)

    expect(id.trim()).not.toBe('')
    expect(storage.map.get(INSTALL_ID_KEY)).toBe(id)
  })
})

describe('track argument typing', () => {
  it('passes the props belonging to the event name', () => {
    const a = createAnalytics()
    const spy = vi.fn()
    a.attach({ capture: spy, identify: () => {}, reset: () => {} })

    a.track('match_end', { mode: '1v1', outcome: 'win', userScore: 5, opponentScore: 3 })

    expect(spy).toHaveBeenCalledWith('match_end', {
      mode: '1v1',
      outcome: 'win',
      userScore: 5,
      opponentScore: 3,
    })
  })
})
