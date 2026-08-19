import type {
  AnalyticsConfig,
  AnalyticsEventName,
  AnalyticsProps,
  AnalyticsSink,
} from '../types/analytics'
import { isNative } from './platform'
import { getItem, setItem } from './storage'

/** PostHog's US cloud ingest host — the default when VITE_POSTHOG_HOST is unset. */
export const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com'

/**
 * How many events are held while the SDK is still loading. The lazy import
 * normally resolves in well under a second, so this only ever fills up when
 * PostHog is unreachable — in which case dropping the oldest is exactly right,
 * and the cap is what stops a blocked network turning into a memory leak.
 */
export const BUFFER_LIMIT = 50

/**
 * Same contract as resolveBannerAd in ads.ts: the real key is baked in by the
 * build's env file, and its absence disables the feature rather than throwing.
 * That keeps unit tests, the dev server, and any build without a key totally
 * silent — no network calls, no events.
 */
export function resolveAnalytics(
  envKey: string | undefined,
  envHost: string | undefined,
): AnalyticsConfig {
  const key = envKey?.trim() ?? ''
  return {
    enabled: key.length > 0,
    key,
    host: envHost?.trim() || DEFAULT_POSTHOG_HOST,
  }
}

export const INSTALL_ID_KEY = 'ftb.installId'

/**
 * A durable anonymous id for this install, used as PostHog's distinct_id.
 *
 * PostHog would happily generate its own, but it writes straight to
 * localStorage, which a WebView is free to evict — and an evicted id reads as
 * a brand-new user, quietly inflating installs and destroying retention. Going
 * through storage.ts instead means the value is mirrored into Capacitor
 * Preferences on native, so it survives eviction and app restarts.
 *
 * Scope caveat worth remembering when reading the numbers: this identifies an
 * *install*, not a person. Uninstall and reinstall produces a new id.
 */
export function getInstallId(
  storage: { getItem(k: string): string | null; setItem(k: string, v: string): void } = {
    getItem,
    setItem,
  },
): string {
  const existing = storage.getItem(INSTALL_ID_KEY)
  if (existing && existing.trim().length > 0) return existing
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : // Pre-2021 WebViews have no randomUUID. Collision odds are irrelevant
        // at this scale and a duplicate only ever merges two installs.
        `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`
  storage.setItem(INSTALL_ID_KEY, id)
  return id
}

type QueuedCall =
  | { kind: 'capture'; name: string; props: Record<string, unknown> }
  | { kind: 'identify'; distinctId: string }
  | { kind: 'reset' }

export interface Analytics {
  /** Adopt the real sink and flush anything queued. Ignored if already attached. */
  attach(sink: AnalyticsSink): void
  track<N extends AnalyticsEventName>(name: N, props: AnalyticsProps<N>): void
  identify(distinctId: string): void
  reset(): void
}

/**
 * The event pipeline, independent of PostHog so it can be tested without
 * loading the SDK. Two rules govern everything here:
 *
 * 1. It never throws. Analytics failing must never take a match down with it,
 *    so every call into the sink is swallowed.
 * 2. Events fired before the SDK finishes loading are queued, not lost —
 *    otherwise `app_open`, the top of the funnel, would race the lazy import
 *    and go missing on exactly the slow devices we most want to hear about.
 */
export function createAnalytics(opts: { disabled?: boolean } = {}): Analytics {
  const disabled = opts.disabled === true
  let sink: AnalyticsSink | null = null
  let queue: QueuedCall[] = []

  function enqueue(call: QueuedCall): void {
    queue.push(call)
    if (queue.length > BUFFER_LIMIT) queue = queue.slice(queue.length - BUFFER_LIMIT)
  }

  function run(call: QueuedCall): void {
    if (!sink) return
    try {
      if (call.kind === 'capture') sink.capture(call.name, call.props)
      else if (call.kind === 'identify') sink.identify(call.distinctId)
      else sink.reset()
    } catch {
      // best-effort by design — see rule 1 above
    }
  }

  function dispatch(call: QueuedCall): void {
    if (disabled) return
    if (sink) run(call)
    else enqueue(call)
  }

  return {
    attach(next) {
      if (disabled || sink) return
      sink = next
      const pending = queue
      queue = []
      pending.forEach(run)
    },
    track(name, props) {
      dispatch({ kind: 'capture', name, props: props as Record<string, unknown> })
    },
    identify(distinctId) {
      dispatch({ kind: 'identify', distinctId })
    },
    reset() {
      dispatch({ kind: 'reset' })
    },
  }
}

export const analyticsConfig = resolveAnalytics(
  import.meta.env.VITE_POSTHOG_KEY,
  import.meta.env.VITE_POSTHOG_HOST,
)

/** App-wide instance. Inert unless initAnalytics() attaches a live sink. */
export const analytics = createAnalytics({ disabled: !analyticsConfig.enabled })

let initStarted = false

/**
 * Load PostHog and attach it. Lazy-imported for the same reason the AdMob SDK
 * is: the bundle stays off the boot path, so a screen never waits on it.
 * Safe to call more than once, and a no-op when no key is configured.
 */
export function initAnalytics(): void {
  if (!analyticsConfig.enabled || initStarted) return
  initStarted = true

  void import('posthog-js')
    .then((mod) => {
      const posthog = mod.posthog ?? mod.default
      posthog.init(analyticsConfig.key, {
        api_host: analyticsConfig.host,
        // Seed the anonymous id from durable storage rather than letting the
        // SDK mint its own — see getInstallId for why that matters on native.
        bootstrap: { distinctID: getInstallId() },
        // A Capacitor WebView serves the app from a localhost-ish origin where
        // cookies are unreliable; localStorage is the durable one. This is also
        // what generates and persists the anonymous distinct_id, so a player is
        // recognisable across launches without ever making an account.
        persistence: 'localStorage',
        // The game is a canvas and a handful of buttons: autocapture would be
        // pure noise and would burn the free tier's event budget on clicks we
        // learn nothing from. Same for pageviews — there are no routes.
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        disable_session_recording: true,
        // Web vitals are on by default and fire LCP/CLS/INP events on every
        // load. Meaningless for a single-screen canvas game with no routes,
        // and they were outnumbering the real events 2:1 in the first test.
        capture_performance: false,
      })
      analytics.attach({
        capture: (name, props) => posthog.capture(name, props),
        identify: (distinctId, props) => posthog.identify(distinctId, props),
        reset: () => posthog.reset(),
      })
      analytics.track('app_open', { native: isNative })
    })
    .catch(() => {
      // SDK blocked or offline — the app carries on with analytics inert.
    })
}
