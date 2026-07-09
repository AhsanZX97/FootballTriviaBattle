import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import type { IncomingMessage } from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'
import { createQueue, dequeue, enqueue } from './matchmaking'
import type { Queue } from './matchmaking'
import { activeSlot, applyKick, createRoom, forfeit, voteRematch } from './room'
import type { PlayerSlot, Room } from './room'
import { MAX_NAME_LENGTH } from '../src/types/multiplayer'
import type { ClientMessage, ServerMessage } from '../src/types/multiplayer'
import { isMatchOver } from '../src/game/shootout'
import { footballBank } from '../src/services/trivia/bank'
import { sampleQuestions } from '../src/services/trivia/sampler'
import { createJwtVerifier } from './auth'
import type { VerifiedToken } from './auth'
import { settleMatch } from './awards'
import type { SettleReason } from './awards'

const PORT = Number(process.env.PORT ?? 8787)
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())

// Coin-award authority. Both are optional: unset in local dev means no coin
// awards happen, but the server keeps working (matches still play out).
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const jwtVerifier = SUPABASE_URL ? createJwtVerifier(SUPABASE_URL) : null

// Grace window for a stalled kick (dropped connection, closed tab): roughly
// the 10s question timer + the ~2.6s feedback animation + a buffer.
const KICK_TIMEOUT_MS = 20_000

interface Connection {
  id: string
  name: string
  ws: WebSocket
  roomId: string | null
  /** Identity captured at handshake from a verified `?token=`. Null for anonymous play. */
  userId: string | null
  /** Server-fetched profile username for an authed connection; overrides any client-sent name. */
  username: string | null
  /**
   * Resolves once an authed connection's profile-username fetch has settled
   * (immediately for anonymous connections). `handleQueue` awaits this so a
   * 'queue' message that arrives right after the socket opens can't race
   * ahead of the profile fetch and fall back to a blank/spoofable name.
   */
  profileReady: Promise<void>
}

interface RoomEntry {
  room: Room
  connections: Record<PlayerSlot, Connection>
  kickTimer: ReturnType<typeof setTimeout> | null
  /** Guards against awarding coins twice (e.g. a kick and a same-tick leave). Reset on rematch. */
  settled: boolean
}

let queue: Queue = createQueue()
const connectionsByWs = new Map<WebSocket, Connection>()
const connectionsById = new Map<string, Connection>()
const rooms = new Map<string, RoomEntry>()
// Handshake-time identity, stashed against the upgrade request so the
// 'connection' handler (which shares the same IncomingMessage) can pick it
// up — ws doesn't otherwise thread verifyClient's result through to it.
const pendingAuth = new WeakMap<IncomingMessage, VerifiedToken | null>()

function send(ws: WebSocket, message: ServerMessage) {
  // Guard the readyState: relaying to a socket that's already closing (both
  // tabs closing at once, a network drop) otherwise throws inside a handler.
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message))
}

function slotOf(entry: RoomEntry, connection: Connection): PlayerSlot {
  return entry.connections.a === connection ? 'a' : 'b'
}

function otherSlot(slot: PlayerSlot): PlayerSlot {
  return slot === 'a' ? 'b' : 'a'
}

function supabaseHeaders(): Record<string, string> {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY!,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  }
}

/**
 * Server-authoritative profile lookup — an authed connection's queue name
 * comes from here, never from the client, so it can't be spoofed. Returns
 * null (never throws) if Supabase isn't configured or the request fails;
 * callers fall back to treating the player as if anonymous for naming.
 */
async function fetchProfileUsername(userId: string): Promise<string | null> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=username`,
      { headers: supabaseHeaders() },
    )
    if (!res.ok) return null
    const rows = (await res.json()) as Array<{ username: string }>
    return rows[0]?.username ?? null
  } catch (err) {
    console.error('[auth] failed to fetch profile username', err)
    return null
  }
}

/**
 * Server-authoritative coin write via the service-role-only `increment_coins`
 * RPC. Returns null (never throws) on any failure — a coin write failing
 * must never block or crash the match it's rewarding.
 */
async function incrementCoins(userId: string, amount: number): Promise<number | null> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_coins`, {
      method: 'POST',
      headers: { ...supabaseHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ p_user_id: userId, p_amount: amount }),
    })
    if (!res.ok) return null
    return (await res.json()) as number
  } catch (err) {
    console.error('[awards] increment_coins RPC failed', err)
    return null
  }
}

/**
 * Settles a finished match exactly once (guarded by `entry.settled`) and
 * pushes `coinsAwarded` to whichever authed player(s) earned a non-zero
 * amount. Fire-and-forget from callers: never throws, and runs after the
 * match-ending message (`kickResolved`/`opponentLeft`) has already been sent.
 */
async function settleAndAward(entry: RoomEntry, reason: SettleReason) {
  if (entry.settled) return
  entry.settled = true
  try {
    const status = entry.room.shootout.status
    if (status === 'playing') return
    const awards = settleMatch(
      status,
      { aUserId: entry.connections.a.userId, bUserId: entry.connections.b.userId },
      reason,
    )
    for (const award of awards) {
      if (award.amount <= 0) continue
      const connection =
        entry.connections.a.userId === award.userId ? entry.connections.a : entry.connections.b
      const balance = await incrementCoins(award.userId, award.amount)
      if (balance === null) continue
      send(connection.ws, { type: 'coinsAwarded', amount: award.amount, balance })
    }
  } catch (err) {
    console.error('[awards] failed to settle match', err)
  }
}

// Enough for 5 kicks each plus a long sudden death.
const QUESTIONS_PER_MATCH = 30

// Both players must see the same questions, so the server draws one shared
// sample per room from the bundled football bank (Node-safe: no DOM APIs).
function questionsForRoom() {
  return sampleQuestions(footballBank, QUESTIONS_PER_MATCH)
}

function armKickTimer(roomId: string, entry: RoomEntry) {
  if (entry.kickTimer) clearTimeout(entry.kickTimer)
  if (isMatchOver(entry.room.shootout)) {
    entry.kickTimer = null
    return
  }
  const slot = activeSlot(entry.room.shootout)
  entry.kickTimer = setTimeout(() => resolveKick(roomId, entry, slot, false), KICK_TIMEOUT_MS)
}

function resolveKick(roomId: string, entry: RoomEntry, slot: PlayerSlot, scored: boolean) {
  entry.room = applyKick(entry.room, slot, scored)
  send(entry.connections[slot].ws, { type: 'kickResolved', by: 'you', scored })
  send(entry.connections[otherSlot(slot)].ws, { type: 'kickResolved', by: 'opponent', scored })
  if (isMatchOver(entry.room.shootout)) {
    void settleAndAward(entry, 'completed')
  }
  armKickTimer(roomId, entry)
}

/** Shared by an explicit 'leave' and a socket close: forfeits an in-progress
 * match, tells the other player, and tears the room down either way. */
function handleLeave(roomId: string, entry: RoomEntry, leaver: Connection) {
  const slot = slotOf(entry, leaver)
  const opponent = entry.connections[otherSlot(slot)]
  if (!isMatchOver(entry.room.shootout)) {
    entry.room = forfeit(entry.room, slot)
    if (entry.kickTimer) clearTimeout(entry.kickTimer)
    void settleAndAward(entry, slot === 'a' ? 'forfeitA' : 'forfeitB')
  }
  send(opponent.ws, { type: 'opponentLeft' })
  opponent.roomId = null
  leaver.roomId = null
  rooms.delete(roomId)
}

async function handleQueue(connection: Connection, name: string) {
  // For an authed connection, wait for the profile-username fetch (kicked
  // off at handshake) so we never fall through to the client-sent name —
  // that name is only trustworthy for anonymous players.
  await connection.profileReady
  const effectiveName = connection.userId ? (connection.username ?? name) : name

  const trimmed = effectiveName.trim().slice(0, MAX_NAME_LENGTH)
  if (!trimmed) {
    send(connection.ws, { type: 'error', reason: 'name required' })
    return
  }
  connection.name = trimmed
  const result = enqueue(queue, {
    id: connection.id,
    name: trimmed,
    userId: connection.userId ?? undefined,
  })
  queue = result.queue
  if (!result.pair) {
    send(connection.ws, { type: 'queued' })
    return
  }

  const [x, y] = result.pair
  const room = createRoom(x, y, Math.random() < 0.5)
  const roomConnections: Record<PlayerSlot, Connection> = {
    a: connectionsById.get(room.players.a.id)!,
    b: connectionsById.get(room.players.b.id)!,
  }
  const roomId = randomUUID()
  roomConnections.a.roomId = roomId
  roomConnections.b.roomId = roomId

  const questions = questionsForRoom()
  send(roomConnections.a.ws, {
    type: 'matched',
    opponentName: roomConnections.b.name,
    youGoFirst: true,
    questions,
  })
  send(roomConnections.b.ws, {
    type: 'matched',
    opponentName: roomConnections.a.name,
    youGoFirst: false,
    questions,
  })

  const entry: RoomEntry = { room, connections: roomConnections, kickTimer: null, settled: false }
  rooms.set(roomId, entry)
  armKickTimer(roomId, entry)
}

function handleKickResult(connection: Connection, scored: boolean) {
  const entry = connection.roomId ? rooms.get(connection.roomId) : undefined
  if (!entry) return
  const slot = slotOf(entry, connection)
  if (isMatchOver(entry.room.shootout) || activeSlot(entry.room.shootout) !== slot) return
  resolveKick(connection.roomId!, entry, slot, scored)
}

function handleRematchVote(connection: Connection) {
  const entry = connection.roomId ? rooms.get(connection.roomId) : undefined
  if (!entry || !isMatchOver(entry.room.shootout)) return
  const slot = slotOf(entry, connection)
  const { room, outcome } = voteRematch(entry.room, slot)
  entry.room = room
  if (outcome === 'waiting') {
    send(entry.connections.a.ws, { type: 'rematchVotes', count: 1 })
    send(entry.connections.b.ws, { type: 'rematchVotes', count: 1 })
    return
  }
  // Fresh shootout state means a fresh match to award — let it settle again.
  entry.settled = false
  const questions = questionsForRoom()
  send(entry.connections.a.ws, { type: 'rematchStart', youGoFirst: true, questions })
  send(entry.connections.b.ws, { type: 'rematchStart', youGoFirst: false, questions })
  armKickTimer(connection.roomId!, entry)
}

function handleMessage(connection: Connection, message: ClientMessage) {
  switch (message.type) {
    case 'queue':
      void handleQueue(connection, message.name)
      return
    case 'cancel':
      queue = dequeue(queue, connection.id)
      return
    case 'kickResult':
      handleKickResult(connection, message.scored)
      return
    case 'rematchVote':
      handleRematchVote(connection)
      return
    case 'leave': {
      if (!connection.roomId) return
      const entry = rooms.get(connection.roomId)
      if (entry) handleLeave(connection.roomId, entry, connection)
      return
    }
  }
}

// Hosts (Render etc.) health-check with plain HTTP, which a bare ws server
// rejects — so the socket server rides on a minimal http server instead.
const httpServer = createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' }).end('ok')
    return
  }
  res.writeHead(426, { 'content-type': 'text/plain' }).end('upgrade required')
})

const wss = new WebSocketServer({
  server: httpServer,
  verifyClient: (info, done) => {
    const originAllowed = !info.origin || ALLOWED_ORIGINS.includes(info.origin)
    if (!originAllowed) {
      done(false)
      return
    }
    const token = new URL(info.req.url ?? '', 'http://localhost').searchParams.get('token')
    if (!token || !jwtVerifier) {
      // No token (anonymous) or no Supabase configured (dev without env
      // vars): still allow the connection through as anonymous.
      done(true)
      return
    }
    jwtVerifier(token)
      .then((result) => {
        pendingAuth.set(info.req, result)
        done(true)
      })
      .catch(() => {
        // A stale/invalid token must degrade to anonymous, never block the handshake.
        done(true)
      })
  },
})

wss.on('connection', (ws, req) => {
  const auth = pendingAuth.get(req) ?? null
  pendingAuth.delete(req)

  const connection: Connection = {
    id: randomUUID(),
    name: '',
    ws,
    roomId: null,
    userId: auth?.userId ?? null,
    username: null,
    profileReady: Promise.resolve(),
  }
  if (connection.userId) {
    connection.profileReady = fetchProfileUsername(connection.userId).then((username) => {
      connection.username = username
    })
  }
  connectionsByWs.set(ws, connection)
  connectionsById.set(connection.id, connection)

  ws.on('message', (data) => {
    let message: ClientMessage
    try {
      message = JSON.parse(data.toString())
    } catch {
      return
    }
    handleMessage(connection, message)
  })

  ws.on('close', () => {
    connectionsByWs.delete(ws)
    connectionsById.delete(connection.id)
    queue = dequeue(queue, connection.id)
    const entry = connection.roomId ? rooms.get(connection.roomId) : undefined
    if (entry) handleLeave(connection.roomId!, entry, connection)
  })
})

httpServer.listen(PORT, () => {
  console.log(`Multiplayer WS server listening on ws://localhost:${PORT}`)
})
