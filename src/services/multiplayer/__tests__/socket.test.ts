import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ServerMessage } from '../../../types/multiplayer'
import { connect } from '../socket'

/** Minimal fake standing in for the browser WebSocket — the system boundary. */
class FakeWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 3

  readyState = FakeWebSocket.CONNECTING
  sent: string[] = []
  url: string
  private listeners: Record<string, Array<(event: unknown) => void>> = {}

  constructor(url: string) {
    this.url = url
  }

  addEventListener(type: string, handler: (event: unknown) => void) {
    ;(this.listeners[type] ??= []).push(handler)
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED
    this.emit('close', {})
  }

  open() {
    this.readyState = FakeWebSocket.OPEN
    this.emit('open', {})
  }

  receive(message: ServerMessage) {
    this.emit('message', { data: JSON.stringify(message) })
  }

  private emit(type: string, event: unknown) {
    this.listeners[type]?.forEach((h) => h(event))
  }
}

let lastSocket: FakeWebSocket

beforeEach(() => {
  vi.stubGlobal(
    'WebSocket',
    class extends FakeWebSocket {
      constructor(url: string) {
        super(url)
        lastSocket = this
      }
    },
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('connect', () => {
  it('queues a message sent before open and flushes it once open fires', () => {
    const socket = connect('ws://test')
    socket.send({ type: 'queue', name: 'Alice' })
    expect(lastSocket.sent).toEqual([])

    lastSocket.open()
    expect(lastSocket.sent).toEqual([JSON.stringify({ type: 'queue', name: 'Alice' })])
  })

  it('sends immediately once the socket is already open', () => {
    const socket = connect('ws://test')
    lastSocket.open()
    socket.send({ type: 'cancel' })
    expect(lastSocket.sent).toEqual([JSON.stringify({ type: 'cancel' })])
  })

  it('delivers parsed messages to onMessage subscribers', () => {
    const socket = connect('ws://test')
    const received: ServerMessage[] = []
    socket.onMessage((m) => received.push(m))

    lastSocket.receive({ type: 'queued' })
    expect(received).toEqual([{ type: 'queued' }])
  })

  it('stops delivering messages after unsubscribing', () => {
    const socket = connect('ws://test')
    const received: ServerMessage[] = []
    const unsubscribe = socket.onMessage((m) => received.push(m))
    unsubscribe()

    lastSocket.receive({ type: 'queued' })
    expect(received).toEqual([])
  })

  it('calls onClose handlers when the socket closes', () => {
    const socket = connect('ws://test')
    const onClose = vi.fn()
    socket.onClose(onClose)

    lastSocket.close()
    expect(onClose).toHaveBeenCalledOnce()
  })
})
