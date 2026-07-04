import type { LobbyPhase } from '../../types/multiplayer'
import type { Question } from '../../types/trivia'
import type { MultiplayerSocket } from '../../services/multiplayer/socket'
import { connect } from '../../services/multiplayer/socket'
import { randomName } from './randomName'

/** Handed to onMatchReady once the lobby's countdown finishes; carries the
 * live socket over so the match doesn't need to reconnect (and lose its room). */
export interface MatchReadySession {
  socket: MultiplayerSocket
  opponentName: string
  youGoFirst: boolean
  questions: Question[]
}

export interface LobbyState {
  phase: LobbyPhase
  name: string
  nameError: string | null
  opponentName: string | null
  youGoFirst: boolean | null
  questions: Question[]
}

type Listener = () => void
type ConnectFn = (url?: string) => MultiplayerSocket

// names aren't persisted: every visit to the lobby rerolls a fresh one
const initialState = (): LobbyState => ({
  phase: 'idle',
  name: randomName(),
  nameError: null,
  opponentName: null,
  youGoFirst: null,
  questions: [],
})

/** Exported for tests, which inject a fake socket; the app uses the `lobbyStore` singleton. */
export function createLobbyStore(connectFn: ConnectFn = connect) {
  let state = initialState()
  let socket: MultiplayerSocket | null = null
  /** Active while queueing only — every other path (cancel, matched, error,
   * handoff) detaches it first, so a firing always means the server dropped us. */
  let offClose: (() => void) | null = null
  const listeners = new Set<Listener>()

  const getState = () => state
  const getSocket = () => socket
  const subscribe = (l: Listener): (() => void) => {
    listeners.add(l)
    return () => void listeners.delete(l)
  }
  const set = (patch: Partial<LobbyState>) => {
    state = { ...state, ...patch }
    listeners.forEach((l) => l())
  }
  const detachClose = () => {
    offClose?.()
    offClose = null
  }

  function setName(name: string) {
    set({ name, nameError: null })
  }

  function rerollName() {
    setName(randomName())
  }

  /** Validates the name and, if non-empty, connects and joins the quick-match queue. */
  function quickMatch() {
    if (state.phase !== 'idle') return
    const trimmed = state.name.trim()
    if (!trimmed) {
      set({ nameError: 'ENTER A NAME FIRST!' })
      return
    }

    socket = connectFn()
    socket.onMessage((message) => {
      switch (message.type) {
        case 'matched':
          // socket survives into the match, whose own connectionLost handling takes over
          detachClose()
          set({
            phase: 'found',
            opponentName: message.opponentName,
            youGoFirst: message.youGoFirst,
            questions: message.questions,
          })
          return
        case 'error':
          detachClose()
          socket?.close()
          socket = null
          set({ phase: 'idle', nameError: message.reason })
          return
        default:
          return
      }
    })
    // fires when the server is unreachable (a failed connect surfaces as a
    // close) or drops us mid-queue: bail out instead of searching forever
    offClose = socket.onClose(() => {
      offClose = null
      socket = null
      set({ phase: 'idle', nameError: "CAN'T REACH SERVER!" })
    })
    socket.send({ type: 'queue', name: trimmed })
    // Optimistic: the server only echoes 'queued' when no opponent was waiting;
    // if paired instantly the next message is 'matched' and this gets overwritten.
    set({ phase: 'searching', nameError: null })
  }

  function cancel() {
    detachClose()
    socket?.send({ type: 'cancel' })
    socket?.close()
    socket = null
    set({ phase: 'idle' })
  }

  /** Drop back to the idle name form. Called once the match takes over the
   * socket, so returning to the lobby doesn't replay the 'found' countdown
   * with a stale/dead socket. Keeps the player's name; the match owns the
   * socket now, so we only drop our reference, never close it here. */
  function reset() {
    detachClose()
    socket = null
    set({ phase: 'idle', nameError: null, opponentName: null, youGoFirst: null, questions: [] })
  }

  return { getState, getSocket, subscribe, setName, rerollName, quickMatch, cancel, reset }
}

export const lobbyStore = createLobbyStore()
