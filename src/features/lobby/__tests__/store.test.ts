import { describe, expect, it, vi } from 'vitest'
import type { ClientMessage, ServerMessage } from '../../../types/multiplayer'
import type { MultiplayerSocket } from '../../../services/multiplayer/socket'
import { createLobbyStore } from '../store'

function createFakeSocket() {
  const messageHandlers: Array<(m: ServerMessage) => void> = []
  const closeHandlers: Array<() => void> = []
  const sent: ClientMessage[] = []
  let closed = false
  const socket: MultiplayerSocket = {
    send: (m) => void sent.push(m),
    onMessage: (h) => {
      messageHandlers.push(h)
      return () => void messageHandlers.splice(messageHandlers.indexOf(h), 1)
    },
    onClose: (h) => {
      closeHandlers.push(h)
      return () => void closeHandlers.splice(closeHandlers.indexOf(h), 1)
    },
    close: () => void (closed = true),
  }
  return {
    socket,
    sent,
    isClosed: () => closed,
    emit: (m: ServerMessage) => messageHandlers.forEach((h) => h(m)),
    emitClose: () => [...closeHandlers].forEach((h) => h()),
  }
}

describe('initial state', () => {
  it('generates a random name without touching localStorage', () => {
    const store = createLobbyStore()
    expect(store.getState().name).toMatch(/^[A-Z]+ [A-Z]+ \d{2}$/)
    expect(localStorage.getItem('ftb:playerName')).toBeNull()
  })
})

describe('setName', () => {
  it('updates state and clears any name error', () => {
    const store = createLobbyStore()
    store.setName('CUSTOM NAME')
    expect(store.getState().name).toBe('CUSTOM NAME')
    expect(store.getState().nameError).toBeNull()
  })
})

describe('rerollName', () => {
  it('replaces a custom name with a fresh random one', () => {
    const store = createLobbyStore()
    store.setName('CUSTOM NAME')
    store.rerollName()
    expect(store.getState().name).toMatch(/^[A-Z]+ [A-Z]+ \d{2}$/)
  })
})

describe('quickMatch', () => {
  it('warns and does not connect when the name is empty', () => {
    const fake = createFakeSocket()
    const connectFn = vi.fn(() => fake.socket)
    const store = createLobbyStore(connectFn)
    store.setName('   ')

    store.quickMatch()

    expect(store.getState().nameError).toBe('ENTER A NAME FIRST!')
    expect(store.getState().phase).toBe('idle')
    expect(connectFn).not.toHaveBeenCalled()
  })

  it('connects, sends queue, and optimistically enters searching', () => {
    const fake = createFakeSocket()
    const store = createLobbyStore(() => fake.socket)
    store.setName('Alice')

    store.quickMatch()

    expect(fake.sent).toEqual([{ type: 'queue', name: 'Alice' }])
    expect(store.getState().phase).toBe('searching')
  })

  it('is a no-op if already searching', () => {
    const fake = createFakeSocket()
    const connectFn = vi.fn(() => fake.socket)
    const store = createLobbyStore(connectFn)
    store.setName('Alice')
    store.quickMatch()
    store.quickMatch()

    expect(connectFn).toHaveBeenCalledOnce()
  })

  it('moves to found with opponent info once matched', () => {
    const fake = createFakeSocket()
    const store = createLobbyStore(() => fake.socket)
    store.setName('Alice')
    store.quickMatch()

    fake.emit({ type: 'matched', opponentName: 'Bob', youGoFirst: true, questions: [] })

    expect(store.getState()).toMatchObject({
      phase: 'found',
      opponentName: 'Bob',
      youGoFirst: true,
    })
  })

  it('reverts to idle with a name error and closes the socket on a server error', () => {
    const fake = createFakeSocket()
    const store = createLobbyStore(() => fake.socket)
    store.setName('Alice')
    store.quickMatch()

    fake.emit({ type: 'error', reason: 'name taken' })

    expect(store.getState().phase).toBe('idle')
    expect(store.getState().nameError).toBe('name taken')
    expect(fake.isClosed()).toBe(true)
  })
})

describe('server unreachable', () => {
  it('warns and returns to idle when the socket closes while searching', () => {
    const fake = createFakeSocket()
    const store = createLobbyStore(() => fake.socket)
    store.setName('Alice')
    store.quickMatch()

    fake.emitClose()

    expect(store.getState().phase).toBe('idle')
    expect(store.getState().nameError).toMatch(/SERVER/)
    expect(store.getSocket()).toBeNull()
  })

  it('does not treat a cancel-initiated close as a server failure', () => {
    const fake = createFakeSocket()
    const store = createLobbyStore(() => fake.socket)
    store.setName('Alice')
    store.quickMatch()

    store.cancel()
    fake.emitClose()

    expect(store.getState().nameError).toBeNull()
    expect(store.getState().phase).toBe('idle')
  })

  it('ignores socket closes once matched — the match screen owns them from there', () => {
    const fake = createFakeSocket()
    const store = createLobbyStore(() => fake.socket)
    store.setName('Alice')
    store.quickMatch()
    fake.emit({ type: 'matched', opponentName: 'Bob', youGoFirst: true, questions: [] })

    fake.emitClose()

    expect(store.getState().phase).toBe('found')
    expect(store.getState().nameError).toBeNull()
  })
})

describe('cancel', () => {
  it('sends cancel, closes the socket, and returns to idle', () => {
    const fake = createFakeSocket()
    const store = createLobbyStore(() => fake.socket)
    store.setName('Alice')
    store.quickMatch()

    store.cancel()

    expect(fake.sent).toContainEqual({ type: 'cancel' })
    expect(fake.isClosed()).toBe(true)
    expect(store.getState().phase).toBe('idle')
  })
})

describe('reset', () => {
  it('returns a found lobby to idle so it will not replay the countdown, keeping the name', () => {
    const fake = createFakeSocket()
    const store = createLobbyStore(() => fake.socket)
    store.setName('Alice')
    store.quickMatch()
    fake.emit({ type: 'matched', opponentName: 'Bob', youGoFirst: true, questions: [] })
    expect(store.getState().phase).toBe('found')

    store.reset()

    expect(store.getState()).toMatchObject({
      phase: 'idle',
      name: 'Alice',
      opponentName: null,
      youGoFirst: null,
    })
    // the match owns the socket after handoff — reset must not close it
    expect(fake.isClosed()).toBe(false)
    expect(store.getSocket()).toBeNull()
  })
})
