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
 *
 * `token`, when given, is appended as a `?token=` query param (browsers
 * can't set WS handshake headers) — pass a Supabase access token to identify
 * the connection to the server. Stays synchronous and optional so every
 * existing anonymous caller (and test) is unaffected; see `connectWithAuth`
 * for the async, session-aware entry point.
 */
export function connect(
  url: string = import.meta.env.VITE_WS_URL ?? DEFAULT_WS_URL,
  token?: string | null,
): MultiplayerSocket {
  const wsUrl = token ? `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}` : url
  const ws = new WebSocket(wsUrl)
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

/**
 * Auth-aware entry point: resolves the current Supabase session (refreshing
 * it first if it's near expiry — supabase-js's default `getSession()`
 * behavior) and connects with its access token attached. Falls back to a
 * plain anonymous `connect()` if there's no session, or if the lookup fails
 * for any reason — a stale/broken token must never block play.
 *
 * `supabase.ts` is imported lazily (only once this function actually runs)
 * so plain `connect()` callers, and their tests, never load or construct the
 * Supabase client at all.
 */
export async function connectWithAuth(url?: string): Promise<MultiplayerSocket> {
  let token: string | null = null
  try {
    const { supabase } = await import('../supabase')
    const { data } = await supabase.auth.getSession()
    token = data.session?.access_token ?? null
  } catch {
    token = null
  }
  return connect(url, token)
}
