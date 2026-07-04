import { randomUUID } from 'node:crypto'
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

const PORT = Number(process.env.PORT ?? 8787)
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())

// Grace window for a stalled kick (dropped connection, closed tab): roughly
// the 10s question timer + the ~2.6s feedback animation + a buffer.
const KICK_TIMEOUT_MS = 20_000

interface Connection {
  id: string
  name: string
  ws: WebSocket
  roomId: string | null
}

interface RoomEntry {
  room: Room
  connections: Record<PlayerSlot, Connection>
  kickTimer: ReturnType<typeof setTimeout> | null
}

let queue: Queue = createQueue()
const connectionsByWs = new Map<WebSocket, Connection>()
const connectionsById = new Map<string, Connection>()
const rooms = new Map<string, RoomEntry>()

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
  }
  send(opponent.ws, { type: 'opponentLeft' })
  opponent.roomId = null
  leaver.roomId = null
  rooms.delete(roomId)
}

function handleQueue(connection: Connection, name: string) {
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH)
  if (!trimmed) {
    send(connection.ws, { type: 'error', reason: 'name required' })
    return
  }
  connection.name = trimmed
  const result = enqueue(queue, { id: connection.id, name: trimmed })
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

  const entry: RoomEntry = { room, connections: roomConnections, kickTimer: null }
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
  const questions = questionsForRoom()
  send(entry.connections.a.ws, { type: 'rematchStart', youGoFirst: true, questions })
  send(entry.connections.b.ws, { type: 'rematchStart', youGoFirst: false, questions })
  armKickTimer(connection.roomId!, entry)
}

function handleMessage(connection: Connection, message: ClientMessage) {
  switch (message.type) {
    case 'queue':
      handleQueue(connection, message.name)
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

const wss = new WebSocketServer({
  port: PORT,
  verifyClient: ({ origin }, done) => {
    done(!origin || ALLOWED_ORIGINS.includes(origin))
  },
})

wss.on('connection', (ws) => {
  const connection: Connection = { id: randomUUID(), name: '', ws, roomId: null }
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

console.log(`Multiplayer WS server listening on ws://localhost:${PORT}`)
