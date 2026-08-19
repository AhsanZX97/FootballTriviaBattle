/**
 * Bot behaviour lives in `src/services/multiplayer/bot.ts` so the client can
 * share it: the offline fallback plays against a bot with the same skill band
 * and pacing the server's queue filler uses. Re-exported here so the server
 * keeps importing './bot' as it always has.
 */
export * from '../src/services/multiplayer/bot'
