/**
 * Coin-award rules live in `src/game/awards.ts` so the client can share them:
 * a signed-out player earning coins on-device must earn exactly what the
 * server would have paid them, or the balance changes the moment they sign in.
 * Re-exported here so the server keeps importing './awards' as it always has.
 */
export * from '../src/game/awards'
