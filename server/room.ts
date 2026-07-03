import type { ShootoutState } from '../src/types/match'
import { applyAnswer, createInitialState, isMatchOver } from '../src/game/shootout'

/** Slot 'a' always kicks first (maps onto the shootout engine's 'user'/'shoot' side). */
export type PlayerSlot = 'a' | 'b'

export interface RoomPlayer {
  id: string
  name: string
}

export interface Room {
  players: { a: RoomPlayer; b: RoomPlayer }
  shootout: ShootoutState
  rematchVotes: Set<PlayerSlot>
}

/** Whose kick the current shootout stage belongs to. */
export function activeSlot(state: ShootoutState): PlayerSlot {
  return state.stage === 'shoot' ? 'a' : 'b'
}

/**
 * The engine's `correct` flag is shooter-perspective ('shoot': correct = goal;
 * 'keep': correct = save). Slot b's kicks run through the 'keep' stage, so its
 * "did I score" has to flip to land on the engine's "did the shooter save it" meaning.
 */
function toEngineCorrect(state: ShootoutState, scored: boolean): boolean {
  return state.stage === 'shoot' ? scored : !scored
}

export function createRoom(playerX: RoomPlayer, playerY: RoomPlayer, xGoesFirst: boolean): Room {
  const players = xGoesFirst ? { a: playerX, b: playerY } : { a: playerY, b: playerX }
  return { players, shootout: createInitialState(), rematchVotes: new Set() }
}

/** Resolve the active player's kick. No-op past match end or from the wrong slot. */
export function applyKick(room: Room, slot: PlayerSlot, scored: boolean): Room {
  if (isMatchOver(room.shootout) || activeSlot(room.shootout) !== slot) return room
  return { ...room, shootout: applyAnswer(room.shootout, toEngineCorrect(room.shootout, scored)) }
}

/** A disconnect/leave forfeits the match to the other slot immediately. No-op if already over. */
export function forfeit(room: Room, bySlot: PlayerSlot): Room {
  if (isMatchOver(room.shootout)) return room
  const winnerIsA = bySlot === 'b'
  return { ...room, shootout: { ...room.shootout, status: winnerIsA ? 'won' : 'lost' } }
}

export type RematchOutcome = 'waiting' | 'ready'

/**
 * Cast a rematch vote. Once both slots have voted, the room resets: a fresh
 * shootout, votes cleared, and (via `coinFlip`) a chance the a/b slots swap
 * so first-kicker rotates between rematches.
 */
export function voteRematch(
  room: Room,
  slot: PlayerSlot,
  coinFlip: () => boolean = () => Math.random() < 0.5,
): { room: Room; outcome: RematchOutcome } {
  const rematchVotes = new Set(room.rematchVotes).add(slot)
  if (rematchVotes.size < 2) {
    return { room: { ...room, rematchVotes }, outcome: 'waiting' }
  }
  const players = coinFlip() ? { a: room.players.b, b: room.players.a } : room.players
  return {
    room: { players, shootout: createInitialState(), rematchVotes: new Set() },
    outcome: 'ready',
  }
}
