import type { LobbyPhase } from '../../types/multiplayer'
import type { Question } from '../../types/trivia'
import type { MultiplayerSocket } from '../../services/multiplayer/socket'
import { connectWithAuth } from '../../services/multiplayer/socket'
import { createLocalMatch, type LocalMatch } from '../../services/multiplayer/localSocket'
import { questionsFromMatchPayload } from '../../services/trivia/bank/localised'
import { i18nStore } from '../../services/i18n/store'
import { authStore } from '../auth/store'
import { randomName } from './randomName'
import { analytics } from '../../services/analytics'

/**
 * server/bot.ts fills a lonely queue after this long. Bots draw their names
 * from the same randomName() generator anonymous players use, so nothing in
 * the 'matched' payload distinguishes one — the queue wait is the only signal
 * available client-side. Treat `likelyBot` as a strong proxy, not proof: a
 * real opponent arriving just after the fill window reads the same way.
 * Keep in sync with BOT_QUEUE_TIMEOUT_MS in server/index.ts.
 */
const BOT_FILL_MS = 8_000

/**
 * How long we wait on the server before giving up and playing a local bot
 * instead (see localSocket.ts). Comfortably past BOT_FILL_MS so a server that
 * is merely quiet still wins the race and supplies its own opponent — this is
 * for a server that is not there at all, or one whose handshake hangs rather
 * than fails.
 */
const SERVER_TIMEOUT_MS = 12_000

/**
 * The floor on how long "SEARCHING…" is shown before a local match appears.
 * A refused connection fails in milliseconds, and a match materialising that
 * fast reads as fake; the server's own filler takes BOT_FILL_MS, so match it.
 */
const MIN_SEARCH_MS = BOT_FILL_MS

/** Handed to onMatchReady once the lobby's countdown finishes; carries the
 * live socket over so the match doesn't need to reconnect (and lose its room). */
export interface MatchReadySession {
  socket: MultiplayerSocket
  opponentName: string
  /** Opponent's equipped keeper skin id from 'matched'; null = stock keeper. */
  opponentGkSkin: string | null
  youGoFirst: boolean
  questions: Question[]
}

export interface LobbyState {
  phase: LobbyPhase
  name: string
  nameError: string | null
  opponentName: string | null
  opponentGkSkin: string | null
  youGoFirst: boolean | null
  questions: Question[]
}

type Listener = () => void
type ConnectFn = (url?: string) => MultiplayerSocket | Promise<MultiplayerSocket>

/** Seams for tests; the app takes every default. */
export interface LobbyDeps {
  createLocal?: () => Promise<LocalMatch>
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>
  clearTimer?: (handle: ReturnType<typeof setTimeout>) => void
}

// names aren't persisted: every visit to the lobby rerolls a fresh one
const initialState = (): LobbyState => ({
  phase: 'idle',
  name: randomName(),
  nameError: null,
  opponentName: null,
  opponentGkSkin: null,
  youGoFirst: null,
  questions: [],
})

/** Exported for tests, which inject a fake socket; the app uses the `lobbyStore` singleton. */
export function createLobbyStore(connectFn: ConnectFn = connectWithAuth, deps: LobbyDeps = {}) {
  const createLocal = deps.createLocal ?? (() => createLocalMatch())
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = deps.clearTimer ?? ((handle) => clearTimeout(handle))

  let state = initialState()
  let socket: MultiplayerSocket | null = null
  /** Armed while searching: fires when we stop waiting on the server. */
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null
  /** Active while queueing only — every other path (cancel, matched, error,
   * handoff) detaches it first, so a firing always means the server dropped us. */
  let offClose: (() => void) | null = null
  /** Bumped by cancel()/reset() so a connect() that resolves after the player
   * backed out doesn't resurrect a queue join — see quickMatch(). */
  let connectAttempt = 0
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
  const clearFallback = () => {
    if (fallbackTimer) clearTimer(fallbackTimer)
    fallbackTimer = null
  }
  const armFallback = (ms: number, fn: () => void) => {
    clearFallback()
    fallbackTimer = setTimer(() => {
      fallbackTimer = null
      fn()
    }, Math.max(0, ms))
  }

  /**
   * Stop waiting on the server and play a bot on this device instead. Drops
   * whatever socket we had, then presents the local match exactly as a server
   * `matched` would — the found screen, and everything after it, can't tell.
   */
  async function goLocal(queueStartedAt: number) {
    clearFallback()
    detachClose()
    socket?.close()
    socket = null
    // Any connect still in flight must not resurrect a queue join behind this.
    const attempt = ++connectAttempt
    const match = await createLocal()
    if (attempt !== connectAttempt) {
      match.socket.close()
      return
    }
    socket = match.socket
    analytics.track('quickmatch_matched', {
      waitedMs: Date.now() - queueStartedAt,
      likelyBot: true,
      offline: true,
    })
    set({
      phase: 'found',
      opponentName: match.opponent.name,
      opponentGkSkin: match.opponent.gkSkin,
      youGoFirst: match.youGoFirst,
      questions: match.questions,
    })
  }

  function setName(name: string) {
    set({ name, nameError: null })
  }

  function rerollName() {
    setName(randomName())
  }

  /** Validates the name (or, when signed in, uses the account username instead
   * and skips the empty-name check entirely) and, if valid, connects and joins
   * the quick-match queue. connectFn (connectWithAuth by default) resolves
   * asynchronously, so a cancel()/reset() fired while connecting is tracked
   * via connectAttempt and unwinds the now-unwanted socket once it arrives. */
  async function quickMatch() {
    if (state.phase !== 'idle') return
    const auth = authStore.getState()
    const trimmed = auth.status === 'signedIn' && auth.username ? auth.username : state.name.trim()
    if (!trimmed) {
      set({ nameError: 'ENTER A NAME FIRST!' })
      return
    }

    const attempt = ++connectAttempt
    // Optimistic: also blocks re-entrant quickMatch() calls while connecting.
    set({ phase: 'searching', nameError: null })
    analytics.track('quickmatch_search_start', {})
    const queueStartedAt = Date.now()
    // Covers a server that never answers *and* a connectFn that never settles.
    armFallback(SERVER_TIMEOUT_MS, () => void goLocal(queueStartedAt))

    let newSocket: MultiplayerSocket
    try {
      newSocket = await connectFn()
    } catch {
      // Couldn't even build a connection (bad URL, no WebSocket). Same answer
      // as an unreachable server: give them a local bot rather than nothing.
      armFallback(MIN_SEARCH_MS, () => void goLocal(queueStartedAt))
      return
    }
    if (attempt !== connectAttempt) {
      // cancel()/reset() ran while we were connecting — don't resurrect a queue join.
      newSocket.close()
      return
    }

    socket = newSocket
    socket.onMessage((message) => {
      switch (message.type) {
        case 'matched': {
          // socket survives into the match, whose own connectionLost handling takes over
          clearFallback()
          detachClose()
          const waitedMs = Date.now() - queueStartedAt
          analytics.track('quickmatch_matched', {
            waitedMs,
            likelyBot: waitedMs >= BOT_FILL_MS,
            offline: false,
          })
          set({
            phase: 'found',
            opponentName: message.opponentName,
            opponentGkSkin: message.opponentGkSkin ?? null,
            youGoFirst: message.youGoFirst,
            questions: questionsFromMatchPayload(message, i18nStore.getLocale()),
          })
          return
        }
        case 'error':
          clearFallback()
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
    // close) or drops us mid-queue. Rather than bounce the player back to the
    // lobby empty-handed, fall through to a local bot — but not instantly, or
    // the "match" lands before the search has looked like one.
    offClose = socket.onClose(() => {
      offClose = null
      socket = null
      armFallback(MIN_SEARCH_MS - (Date.now() - queueStartedAt), () => void goLocal(queueStartedAt))
    })
    socket.send({ type: 'queue', name: trimmed })
  }

  function cancel() {
    connectAttempt++
    clearFallback()
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
    connectAttempt++
    clearFallback()
    detachClose()
    socket = null
    set({
      phase: 'idle',
      nameError: null,
      opponentName: null,
      opponentGkSkin: null,
      youGoFirst: null,
      questions: [],
    })
  }

  return { getState, getSocket, subscribe, setName, rerollName, quickMatch, cancel, reset }
}

export const lobbyStore = createLobbyStore()
