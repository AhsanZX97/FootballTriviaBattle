import type { ChallengeFailReason, ServerMessage } from '../../types/multiplayer'
import type { MultiplayerSocket } from '../../services/multiplayer/socket'
import { connectWithAuth } from '../../services/multiplayer/socket'
import type { MatchReadySession } from '../lobby/store'
import { authStore } from '../auth/store'

/** A challenge you've sent, awaiting the friend's answer. */
export interface OutgoingChallenge {
  friendId: string
  friendName: string
  /** null until the server acks with `challengeSent`. */
  challengeId: string | null
}

/** A challenge a friend has sent you. */
export interface IncomingChallenge {
  challengeId: string
  fromUserId: string
  fromName: string
}

export interface PresenceState {
  connected: boolean
  outgoing: OutgoingChallenge | null
  incoming: IncomingChallenge | null
  /** Transient message (friend offline / declined / withdrew). Cleared on the
   * next action or via clearNotice. */
  notice: string | null
}

type Listener = () => void
type ConnectFn = (url?: string) => MultiplayerSocket | Promise<MultiplayerSocket>
type MatchReadyHandler = (session: MatchReadySession) => void
type FriendsChangedHandler = () => void

/** Minimal auth slice: connect while signed in, tear down on sign-out. */
export interface AuthSeam {
  getState(): { status: string }
  subscribe(listener: () => void): () => void
}

const RECONNECT_DELAY_MS = 2000

const initialState = (): PresenceState => ({
  connected: false,
  outgoing: null,
  incoming: null,
  notice: null,
})

function failNotice(name: string, reason: ChallengeFailReason): string {
  switch (reason) {
    case 'offline':
      return `${name} is offline.`
    case 'busy':
      return `${name} is in a match.`
    case 'declined':
      return `${name} declined.`
    case 'expired':
      return `${name} didn't respond.`
    case 'gone':
      return `${name} went offline.`
  }
}

/** Exported for tests, which inject a fake socket + auth seam; the app uses the
 * `presenceStore` singleton. */
export function createPresenceStore(
  deps: { connectFn?: ConnectFn; auth?: AuthSeam } = {},
) {
  const connectFn = deps.connectFn ?? connectWithAuth
  const auth = deps.auth ?? (authStore as unknown as AuthSeam)

  let state: PresenceState = initialState()
  const listeners = new Set<Listener>()
  const matchReadyHandlers = new Set<MatchReadyHandler>()
  const friendsChangedHandlers = new Set<FriendsChangedHandler>()

  let socket: MultiplayerSocket | null = null
  let offMessage: (() => void) | null = null
  let offClose: (() => void) | null = null
  let connecting: Promise<void> | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  /** True while we want a live presence connection (signed in, not in a match). */
  let desired = false

  const getState = () => state
  const subscribe = (l: Listener): (() => void) => {
    listeners.add(l)
    return () => void listeners.delete(l)
  }
  const set = (patch: Partial<PresenceState>) => {
    state = { ...state, ...patch }
    listeners.forEach((l) => l())
  }

  const onMatchReady = (handler: MatchReadyHandler): (() => void) => {
    matchReadyHandlers.add(handler)
    return () => void matchReadyHandlers.delete(handler)
  }

  /** Fires when a friend's action (request/accept/…) nudges us to re-fetch.
   * App wires this to friendsStore.refresh so the two stores stay decoupled. */
  const onFriendsChanged = (handler: FriendsChangedHandler): (() => void) => {
    friendsChangedHandlers.add(handler)
    return () => void friendsChangedHandlers.delete(handler)
  }

  /** Drop our handlers from the socket without closing it (the match adopts it),
   * and forget it so we no longer treat it as our presence link. */
  function detachSocket() {
    offMessage?.()
    offClose?.()
    offMessage = null
    offClose = null
    socket = null
  }

  function teardown() {
    desired = false
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    const s = socket
    detachSocket()
    s?.close()
    connecting = null
    set(initialState())
  }

  function scheduleReconnect() {
    if (reconnectTimer || !desired) return
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      void connect()
    }, RECONNECT_DELAY_MS)
  }

  function handleMessage(message: ServerMessage) {
    switch (message.type) {
      case 'challengeSent':
        if (state.outgoing) set({ outgoing: { ...state.outgoing, challengeId: message.challengeId } })
        return
      case 'challengeReceived':
        set({
          incoming: {
            challengeId: message.challengeId,
            fromUserId: message.fromUserId,
            fromName: message.fromName,
          },
        })
        return
      case 'challengeFailed': {
        const name = state.outgoing?.friendName ?? 'Your friend'
        set({ outgoing: null, notice: failNotice(name, message.reason) })
        return
      }
      case 'challengeCanceled':
        // withdrawn/expired invite we were shown
        if (state.incoming?.challengeId === message.challengeId) {
          set({ incoming: null, notice: 'Challenge withdrawn.' })
        }
        return
      case 'friendsChanged':
        friendsChangedHandlers.forEach((h) => h())
        return
      case 'matched': {
        const s = socket
        if (!s) return
        const session: MatchReadySession = {
          socket: s,
          opponentName: message.opponentName,
          youGoFirst: message.youGoFirst,
          questions: message.questions,
        }
        // hand our socket to the match and stand down until we're back on the menu
        desired = false
        detachSocket()
        set({ connected: false, outgoing: null, incoming: null })
        matchReadyHandlers.forEach((h) => h(session))
        return
      }
      default:
        return
    }
  }

  /** Open the presence connection if we want one and don't already have it.
   * Idempotent; resolves once a socket object exists (even if still opening —
   * the socket wrapper queues sends until it's open). */
  function connect(): Promise<void> {
    desired = true
    if (socket) return Promise.resolve()
    if (connecting) return connecting
    connecting = Promise.resolve(connectFn()).then((s) => {
      connecting = null
      // signed out / handed off while connecting — discard this socket
      if (!desired) {
        s.close()
        return
      }
      socket = s
      offMessage = s.onMessage(handleMessage)
      offClose = s.onClose(() => {
        detachSocket()
        set({ connected: false, incoming: null, outgoing: null })
        scheduleReconnect()
      })
      set({ connected: true })
    })
    return connecting
  }

  async function challenge(friendId: string, friendName: string): Promise<void> {
    set({ outgoing: { friendId, friendName, challengeId: null }, notice: null, incoming: null })
    await connect()
    socket?.send({ type: 'challenge', targetUserId: friendId })
  }

  function cancelOutgoing(): void {
    if (state.outgoing?.challengeId) {
      socket?.send({ type: 'challengeCancel', challengeId: state.outgoing.challengeId })
    }
    set({ outgoing: null })
  }

  function acceptIncoming(): void {
    if (!state.incoming) return
    socket?.send({ type: 'challengeAccept', challengeId: state.incoming.challengeId })
    // keep `incoming` until 'matched' arrives so the popup shows a pending state;
    // a 'challengeCanceled' clears it if the challenger vanished first
  }

  function declineIncoming(): void {
    if (!state.incoming) return
    socket?.send({ type: 'challengeDecline', challengeId: state.incoming.challengeId })
    set({ incoming: null })
  }

  function clearNotice(): void {
    set({ notice: null })
  }

  /** Tell the server to nudge these users (people I just changed a friendship
   * with) so their friends list / request badge refreshes live. */
  async function notifyFriends(userIds: string[]): Promise<void> {
    if (userIds.length === 0) return
    await connect()
    socket?.send({ type: 'notifyFriends', userIds })
  }

  // Connect while signed in, tear down on sign-out.
  let lastStatus: string | null = null
  const syncToAuth = () => {
    const status = auth.getState().status
    if (status === lastStatus) return
    lastStatus = status
    if (status === 'signedIn') void connect()
    else if (status === 'signedOut') teardown()
  }
  auth.subscribe(syncToAuth)
  // Initial connect only, deferred so constructing the singleton does no
  // import-time auth read (that would fire before a test's auth mock is set up).
  // Never tears down here — teardown only follows a real signed-out transition.
  queueMicrotask(() => {
    lastStatus = auth.getState().status
    if (lastStatus === 'signedIn') void connect()
  })

  return {
    getState,
    subscribe,
    onMatchReady,
    onFriendsChanged,
    connect,
    challenge,
    cancelOutgoing,
    acceptIncoming,
    declineIncoming,
    clearNotice,
    notifyFriends,
  }
}

export type PresenceStore = ReturnType<typeof createPresenceStore>

export const presenceStore = createPresenceStore()
