import { describe, expect, it, vi } from 'vitest'
import type { ClientMessage, ServerMessage } from '../../../types/multiplayer'
import type { MultiplayerSocket } from '../../../services/multiplayer/socket'
import type { Question } from '../../../types/trivia'
import { createPresenceStore, type AuthSeam } from '../presenceStore'

function createFakeAuth(initial = 'signedOut') {
  let status = initial
  const listeners = new Set<() => void>()
  return {
    seam: {
      getState: () => ({ status }),
      subscribe: (l: () => void) => {
        listeners.add(l)
        return () => void listeners.delete(l)
      },
    } as AuthSeam,
    setStatus(next: string) {
      status = next
      listeners.forEach((l) => l())
    },
  }
}

function createFakeSocket() {
  const messageHandlers = new Set<(m: ServerMessage) => void>()
  const closeHandlers = new Set<() => void>()
  const sent: ClientMessage[] = []
  const socket: MultiplayerSocket = {
    send: (m) => void sent.push(m),
    onMessage: (h) => {
      messageHandlers.add(h)
      return () => void messageHandlers.delete(h)
    },
    onClose: (h) => {
      closeHandlers.add(h)
      return () => void closeHandlers.delete(h)
    },
    close: vi.fn(),
  }
  return {
    socket,
    sent,
    emit: (m: ServerMessage) => messageHandlers.forEach((h) => h(m)),
    emitClose: () => closeHandlers.forEach((h) => h()),
  }
}

const matched = (opponentName = 'Bob'): ServerMessage => ({
  type: 'matched',
  opponentName,
  youGoFirst: true,
  questions: [] as Question[],
})

describe('presence store', () => {
  it('connects when asked and marks itself connected', async () => {
    const { seam } = createFakeAuth('signedOut')
    const fake = createFakeSocket()
    const store = createPresenceStore({ connectFn: () => fake.socket, auth: seam })
    await store.connect()
    expect(store.getState().connected).toBe(true)
  })

  it('challenge sends a challenge message and records the outgoing invite', async () => {
    const { seam } = createFakeAuth('signedOut')
    const fake = createFakeSocket()
    const store = createPresenceStore({ connectFn: () => fake.socket, auth: seam })
    await store.challenge('f1', 'Bob')
    expect(fake.sent).toContainEqual({ type: 'challenge', targetUserId: 'f1' })
    expect(store.getState().outgoing).toMatchObject({ friendId: 'f1', friendName: 'Bob' })
  })

  it('records the challenge id from challengeSent', async () => {
    const { seam } = createFakeAuth('signedOut')
    const fake = createFakeSocket()
    const store = createPresenceStore({ connectFn: () => fake.socket, auth: seam })
    await store.challenge('f1', 'Bob')
    fake.emit({ type: 'challengeSent', challengeId: 'ch1' })
    expect(store.getState().outgoing?.challengeId).toBe('ch1')
  })

  it('surfaces an incoming challenge', async () => {
    const { seam } = createFakeAuth('signedOut')
    const fake = createFakeSocket()
    const store = createPresenceStore({ connectFn: () => fake.socket, auth: seam })
    await store.connect()
    fake.emit({ type: 'challengeReceived', challengeId: 'ch2', fromUserId: 'u2', fromName: 'Carol' })
    expect(store.getState().incoming).toMatchObject({ challengeId: 'ch2', fromName: 'Carol' })
  })

  it('clears the outgoing invite and shows a notice on challengeFailed', async () => {
    const { seam } = createFakeAuth('signedOut')
    const fake = createFakeSocket()
    const store = createPresenceStore({ connectFn: () => fake.socket, auth: seam })
    await store.challenge('f1', 'Bob')
    fake.emit({ type: 'challengeFailed', reason: 'offline' })
    expect(store.getState().outgoing).toBeNull()
    expect(store.getState().notice).toMatch(/bob is offline/i)
  })

  it('acceptIncoming sends challengeAccept', async () => {
    const { seam } = createFakeAuth('signedOut')
    const fake = createFakeSocket()
    const store = createPresenceStore({ connectFn: () => fake.socket, auth: seam })
    await store.connect()
    fake.emit({ type: 'challengeReceived', challengeId: 'ch2', fromUserId: 'u2', fromName: 'Carol' })
    store.acceptIncoming()
    expect(fake.sent).toContainEqual({ type: 'challengeAccept', challengeId: 'ch2' })
  })

  it('declineIncoming sends challengeDecline and clears the invite', async () => {
    const { seam } = createFakeAuth('signedOut')
    const fake = createFakeSocket()
    const store = createPresenceStore({ connectFn: () => fake.socket, auth: seam })
    await store.connect()
    fake.emit({ type: 'challengeReceived', challengeId: 'ch2', fromUserId: 'u2', fromName: 'Carol' })
    store.declineIncoming()
    expect(fake.sent).toContainEqual({ type: 'challengeDecline', challengeId: 'ch2' })
    expect(store.getState().incoming).toBeNull()
  })

  it('emits a match session on matched, handing over the socket', async () => {
    const { seam } = createFakeAuth('signedOut')
    const fake = createFakeSocket()
    const store = createPresenceStore({ connectFn: () => fake.socket, auth: seam })
    await store.connect()
    const handler = vi.fn()
    store.onMatchReady(handler)
    fake.emit(matched('Bob'))
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0]![0]).toMatchObject({ socket: fake.socket, opponentName: 'Bob', youGoFirst: true })
  })

  it('notifyFriends sends the userIds to the server', async () => {
    const { seam } = createFakeAuth('signedOut')
    const fake = createFakeSocket()
    const store = createPresenceStore({ connectFn: () => fake.socket, auth: seam })
    await store.notifyFriends(['u1', 'u2'])
    expect(fake.sent).toContainEqual({ type: 'notifyFriends', userIds: ['u1', 'u2'] })
  })

  it('friendsChanged fires onFriendsChanged handlers', async () => {
    const { seam } = createFakeAuth('signedOut')
    const fake = createFakeSocket()
    const store = createPresenceStore({ connectFn: () => fake.socket, auth: seam })
    await store.connect()
    const handler = vi.fn()
    store.onFriendsChanged(handler)
    fake.emit({ type: 'friendsChanged' })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('tears down and clears state on sign-out', async () => {
    const { seam, setStatus } = createFakeAuth('signedIn')
    const fake = createFakeSocket()
    const store = createPresenceStore({ connectFn: () => fake.socket, auth: seam })
    await store.connect()
    fake.emit({ type: 'challengeReceived', challengeId: 'ch2', fromUserId: 'u2', fromName: 'Carol' })
    setStatus('signedOut')
    expect(store.getState().incoming).toBeNull()
    expect(store.getState().connected).toBe(false)
  })
})
