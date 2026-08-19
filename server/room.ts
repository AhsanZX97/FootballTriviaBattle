/**
 * Room rules live in `src/game/room.ts` so the client can share them: the
 * offline fallback (src/services/multiplayer/localSocket.ts) runs the very
 * same room a real match does. Re-exported here so the server keeps importing
 * './room' as it always has.
 */
export * from '../src/game/room'
