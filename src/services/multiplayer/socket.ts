import type { ClientMessage, ServerMessage } from '../../types/multiplayer'

const DEFAULT_WS_URL = 'ws://localhost:8787'

export interface MultiplayerSocket {
  send(message: ClientMessage): void
  onMessage(handler: (message: ServerMessage) => void): () => void
  onClose(handler: () => void): () => void
  close(): void
}

/**
 * Thin typed wrapper around the raw WebSocket. Messages sent before the
 * socket finishes opening are queued and flushed on 'open', since the lobby
 * connects and immediately sends a 'queue' message in the same call.
 */
export function connect(url: string = import.meta.env.VITE_WS_URL ?? DEFAULT_WS_URL): MultiplayerSocket {
  const ws = new WebSocket(url)
  const messageHandlers = new Set<(message: ServerMessage) => void>()
  const closeHandlers = new Set<() => void>()
  const pending: ClientMessage[] = []

  ws.addEventListener('open', () => {
    for (const message of pending.splice(0)) ws.send(JSON.stringify(message))
  })
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data as string) as ServerMessage
    messageHandlers.forEach((h) => h(message))
  })
  ws.addEventListener('close', () => {
    closeHandlers.forEach((h) => h())
  })

  return {
    send(message) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message))
      else pending.push(message)
    },
    onMessage(handler) {
      messageHandlers.add(handler)
      return () => void messageHandlers.delete(handler)
    },
    onClose(handler) {
      closeHandlers.add(handler)
      return () => void closeHandlers.delete(handler)
    },
    close() {
      ws.close()
    },
  }
}
