/**
 * Product analytics event vocabulary. Deliberately small: every event here
 * answers a question we currently cannot answer at all (see the funnel notes
 * in CLAUDE.md). Per-question events are intentionally absent — they are by
 * far the highest-volume thing the game does and they tell us nothing the
 * match-level events don't.
 *
 * Names are snake_case because that is what PostHog's UI groups on.
 */
export type AnalyticsEvent =
  /** App became interactive. Fires once per launch, the funnel's top. */
  | { name: 'app_open'; props: { native: boolean } }
  /** A match began. `mode` splits solo practice from real multiplayer. */
  | { name: 'match_start'; props: { mode: 'cpu' | '1v1' } }
  /** A match ran to a result. */
  | {
      name: 'match_end'
      props: {
        mode: 'cpu' | '1v1'
        outcome: 'win' | 'loss'
        userScore: number
        opponentScore: number
      }
    }
  /** Player left a match before full time — the drop-off we can't see today. */
  | { name: 'match_quit'; props: { mode: 'cpu' | '1v1'; questionIndex: number } }
  /** Quick-match queue joined. */
  | { name: 'quickmatch_search_start'; props: Record<string, never> }
  /**
   * Quick match paired up. `waitedMs` is the bot-fill proxy: server/bot.ts
   * fills after 8s, so a wait at or above that is almost certainly a bot.
   * Without this we cannot tell whether 1v1 has ever had two real players.
   */
  | {
      name: 'quickmatch_matched'
      props: {
        waitedMs: number
        likelyBot: boolean
        /** True when the server never answered and the player was given a
         * local bot instead (see services/multiplayer/localSocket.ts). */
        offline: boolean
      }
    }
  /** The account gate was actually rendered. */
  | { name: 'signup_shown'; props: Record<string, never> }
  /** Create-account form submitted (before we know if it succeeded). */
  | { name: 'signup_submitted'; props: Record<string, never> }
  /** Account created. Currently zero of these across 150 installs. */
  | { name: 'signup_done'; props: Record<string, never> }
  /** Returning player signed in. */
  | { name: 'signin_done'; props: Record<string, never> }
  /**
   * The silent Play Games sign-in attempt at launch, whatever came of it.
   * `unavailable` is the common case and not a failure — web, no Play
   * Services, a player who declined — while `failed` means Play Games gave us
   * a code our backend then refused, which is ours to fix.
   */
  | { name: 'pgs_signin'; props: { outcome: 'done' | 'unavailable' | 'failed' } }
  /** Shop surface opened. */
  | { name: 'shop_opened'; props: { coins: number } }
  /** Rewarded video watched to completion. */
  | { name: 'rewarded_ad_watched'; props: Record<string, never> }

/** Event names, derived so a call site can never invent one. */
export type AnalyticsEventName = AnalyticsEvent['name']

/** The props type belonging to a given event name. */
export type AnalyticsProps<N extends AnalyticsEventName> = Extract<
  AnalyticsEvent,
  { name: N }
>['props']

/**
 * The subset of a PostHog client this app uses. Keeping it to an interface
 * means the store logic is testable without loading posthog-js, and swapping
 * the backend later touches one file.
 */
export interface AnalyticsSink {
  capture(name: string, props?: Record<string, unknown>): void
  identify(distinctId: string, props?: Record<string, unknown>): void
  reset(): void
}

/** Outcome of reading the PostHog env vars. */
export interface AnalyticsConfig {
  enabled: boolean
  key: string
  host: string
}
