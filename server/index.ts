import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import type { IncomingMessage } from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'
import { createQueue, dequeue, enqueue } from './matchmaking'
import type { Queue } from './matchmaking'
import { createChallengeStore } from './challenges'
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

// Boot-time visibility into why coin awards might silently do nothing.
console.log(
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? '[config] coin awards ENABLED (Supabase URL + service role key present)'
    : `[config] coin awards DISABLED — SUPABASE_URL ${SUPABASE_URL ? 'set' : 'MISSING'}, SUPABASE_SERVICE_ROLE_KEY ${SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'MISSING'}`,
)

// Grace window for a stalled kick (dropped connection, closed tab): roughly
// the 10s question timer + the ~2.6s feedback animation + a buffer.
const KICK_TIMEOUT_MS = 20_000

// How long a friend challenge stays live before it auto-expires (the target
// never answered). Kept short so a stale invite doesn't linger on either side.
const CHALLENGE_TIMEOUT_MS = 30_000

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
// Presence: every live authed connection, grouped by userId (a user may have
// several tabs/devices open). Used to locate a friend to deliver a challenge to.
const connectionsByUser = new Map<string, Set<Connection>>()
// In-flight friend challenges + their expiry timers (parallel maps keyed by
// challenge id). See challenges.ts for the pure bookkeeping.
const challenges = createChallengeStore()
const challengeTimers = new Map<string, ReturnType<typeof setTimeout>>()
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
    if (!res.ok) {
      console.error(`[awards] increment_coins RPC rejected: HTTP ${res.status} ${await res.text()}`)
      return null
    }
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
    console.log(
      `[awards] settling reason=${reason} status=${status}` +
        ` a=${entry.connections.a.userId ?? 'anonymous'} b=${entry.connections.b.userId ?? 'anonymous'}` +
        ` awards=${JSON.stringify(awards)}`,
    )
    for (const award of awards) {
      if (award.amount <= 0) continue
      const connection =
        entry.connections.a.userId === award.userId ? entry.connections.a : entry.connections.b
      const balance = await incrementCoins(award.userId, award.amount)
      if (balance === null) continue
      console.log(`[awards] +${award.amount} coins -> ${award.userId} (new balance ${balance})`)
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

/**
 * Put two live connections into a fresh match: build the room, notify both
 * with `matched`, and arm the first kick timer. Shared by quick-match pairing
 * (handleQueue) and friend challenges (handleChallengeAccept). `xGoesFirst`
 * decides which of the two takes slot 'a' (kicks first).
 */
function startMatch(x: Connection, y: Connection, xGoesFirst: boolean) {
  const room = createRoom({ id: x.id, name: x.name }, { id: y.id, name: y.name }, xGoesFirst)
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
  startMatch(connectionsById.get(x.id)!, connectionsById.get(y.id)!, Math.random() < 0.5)
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

// --- presence (authed connections grouped by userId) ---

function addPresence(connection: Connection) {
  if (!connection.userId) return
  let set = connectionsByUser.get(connection.userId)
  if (!set) {
    set = new Set()
    connectionsByUser.set(connection.userId, set)
  }
  set.add(connection)
}

function removePresence(connection: Connection) {
  if (!connection.userId) return
  const set = connectionsByUser.get(connection.userId)
  if (!set) return
  set.delete(connection)
  if (set.size === 0) connectionsByUser.delete(connection.userId)
}

// --- friend challenges ---

function clearChallengeTimer(id: string) {
  const timer = challengeTimers.get(id)
  if (timer) {
    clearTimeout(timer)
    challengeTimers.delete(id)
  }
}

/** No answer within CHALLENGE_TIMEOUT_MS: drop the invite and tell both sides. */
function expireChallenge(id: string) {
  challengeTimers.delete(id)
  const challenge = challenges.remove(id)
  if (!challenge) return
  const challenger = connectionsById.get(challenge.challengerConnId)
  if (challenger) send(challenger.ws, { type: 'challengeFailed', reason: 'expired' })
  const target = connectionsById.get(challenge.targetConnId)
  if (target) send(target.ws, { type: 'challengeCanceled', challengeId: id })
}

/** A player challenges a friend by userId. Requires an authed challenger and a
 * friend who is online and not already in a match. */
async function handleChallenge(connection: Connection, targetUserId: string) {
  if (!connection.userId || connection.roomId || targetUserId === connection.userId) return
  // Username (== display name for challenges) is fetched at handshake; wait for
  // it so the invite carries a real name, not a blank.
  await connection.profileReady

  // Only one outstanding outgoing challenge at a time — replace any prior one,
  // telling its target the invite is gone.
  const existing = challenges.outgoingFor(connection.id)
  if (existing) {
    challenges.remove(existing.id)
    clearChallengeTimer(existing.id)
    const oldTarget = connectionsById.get(existing.targetConnId)
    if (oldTarget) send(oldTarget.ws, { type: 'challengeCanceled', challengeId: existing.id })
  }

  const candidates = connectionsByUser.get(targetUserId)
  if (!candidates || candidates.size === 0) {
    send(connection.ws, { type: 'challengeFailed', reason: 'offline' })
    return
  }
  const target = [...candidates].find((c) => !c.roomId)
  if (!target) {
    send(connection.ws, { type: 'challengeFailed', reason: 'busy' })
    return
  }

  const id = randomUUID()
  challenges.add({
    id,
    challengerConnId: connection.id,
    targetConnId: target.id,
    createdAt: Date.now(),
  })
  challengeTimers.set(id, setTimeout(() => expireChallenge(id), CHALLENGE_TIMEOUT_MS))
  send(connection.ws, { type: 'challengeSent', challengeId: id })
  send(target.ws, {
    type: 'challengeReceived',
    challengeId: id,
    fromUserId: connection.userId,
    fromName: connection.name || 'A friend',
  })
}

function handleChallengeAccept(connection: Connection, challengeId: string) {
  const challenge = challenges.get(challengeId)
  if (!challenge || challenge.targetConnId !== connection.id) return
  challenges.remove(challengeId)
  clearChallengeTimer(challengeId)
  if (connection.roomId) return
  const challenger = connectionsById.get(challenge.challengerConnId)
  if (!challenger || challenger.roomId) {
    // Challenger disconnected or got into another match while we deliberated.
    send(connection.ws, { type: 'challengeCanceled', challengeId })
    return
  }
  startMatch(challenger, connection, Math.random() < 0.5)
}

function handleChallengeDecline(connection: Connection, challengeId: string) {
  const challenge = challenges.get(challengeId)
  if (!challenge || challenge.targetConnId !== connection.id) return
  challenges.remove(challengeId)
  clearChallengeTimer(challengeId)
  const challenger = connectionsById.get(challenge.challengerConnId)
  if (challenger) send(challenger.ws, { type: 'challengeFailed', reason: 'declined' })
}

/** The challenger withdraws before the target answers. */
function handleChallengeCancel(connection: Connection, challengeId: string) {
  const challenge = challenges.get(challengeId)
  if (!challenge || challenge.challengerConnId !== connection.id) return
  challenges.remove(challengeId)
  clearChallengeTimer(challengeId)
  const target = connectionsById.get(challenge.targetConnId)
  if (target) send(target.ws, { type: 'challengeCanceled', challengeId })
}

/** Drop every challenge a disconnecting connection was part of, notifying the
 * still-connected other side. */
function cleanUpChallenges(connection: Connection) {
  for (const challenge of challenges.removeInvolving(connection.id)) {
    clearChallengeTimer(challenge.id)
    const isChallenger = challenge.challengerConnId === connection.id
    const otherId = isChallenger ? challenge.targetConnId : challenge.challengerConnId
    const other = connectionsById.get(otherId)
    if (!other) continue
    if (isChallenger) {
      // the target loses an invite that's no longer answerable
      send(other.ws, { type: 'challengeCanceled', challengeId: challenge.id })
    } else {
      // the challenger's target vanished
      send(other.ws, { type: 'challengeFailed', reason: 'gone' })
    }
  }
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
    case 'challenge':
      void handleChallenge(connection, message.targetUserId)
      return
    case 'challengeAccept':
      handleChallengeAccept(connection, message.challengeId)
      return
    case 'challengeDecline':
      handleChallengeDecline(connection, message.challengeId)
      return
    case 'challengeCancel':
      handleChallengeCancel(connection, message.challengeId)
      return
  }
}

// Hosts (Render etc.) health-check with plain HTTP, which a bare ws server
// rejects — so the socket server rides on a minimal http server instead.
const httpServer = createServer((req, res) => {
  if (req.url === '/healthz') {
    // `coinAwards: false` in prod means the Supabase env vars are missing on
    // the host — the #1 silent cause of "won but got no coins".
    res.writeHead(200, { 'content-type': 'application/json' }).end(
      JSON.stringify({
        ok: true,
        coinAwards: Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY),
      }),
    )
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
      if (token && !jwtVerifier) {
        console.log('[auth] client sent a token but SUPABASE_URL is unset — treating as anonymous')
      }
      done(true)
      return
    }
    jwtVerifier(token)
      .then((result) => {
        if (!result) {
          console.log('[auth] token failed verification (bad signature / expired / no sub) — anonymous')
        }
        pendingAuth.set(info.req, result)
        done(true)
      })
      .catch(() => {
        // A stale/invalid token must degrade to anonymous, never block the handshake.
        console.log('[auth] token verification threw (JWKS unreachable?) — anonymous')
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
  console.log(
    `[auth] connection ${connection.id} ${connection.userId ? `authed as ${connection.userId}` : 'anonymous'}`,
  )
  if (connection.userId) {
    connection.profileReady = fetchProfileUsername(connection.userId).then((username) => {
      connection.username = username
      // Default display name for challenge matches (quick-match overrides it in
      // handleQueue). Lets an invite carry a real name without queueing first.
      if (username) connection.name = username
    })
  }
  connectionsByWs.set(ws, connection)
  connectionsById.set(connection.id, connection)
  addPresence(connection)

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
    removePresence(connection)
    cleanUpChallenges(connection)
    queue = dequeue(queue, connection.id)
    const entry = connection.roomId ? rooms.get(connection.roomId) : undefined
    if (entry) handleLeave(connection.roomId!, entry, connection)
  })
})

httpServer.listen(PORT, () => {
  console.log(`Multiplayer WS server listening on ws://localhost:${PORT}`)
})
