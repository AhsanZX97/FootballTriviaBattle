import type { ClientMessage, ServerMessage } from '../../types/multiplayer'
import type { Question } from '../../types/trivia'
import type { MultiplayerSocket } from './socket'
import type { BotProfile } from './bot'
import { botKickDelayMs, botRematchDelayMs, botScores, createBotProfile } from './bot'
import { activeSlot, applyKick, createRoom, voteRematch, type PlayerSlot, type Room } from '../../game/room'
import { isMatchOver } from '../../game/shootout'
import { getQuestions } from '../trivia/questionSource'

/**
 * A whole 1v1 match played against a bot on this device, behind the same
 * `MultiplayerSocket` interface the real server connection implements.
 *
 * This exists for one case: the player asked for a match and the server never
 * answered — offline, server down, or a handshake that hangs rather than
 * fails. Rather than bounce them back to the lobby with an error, the lobby
 * hands the match screen one of these and the game plays out normally. Nothing
 * in `matchStore` or `MatchScreen` knows the difference; they speak the same
 * protocol either way.
 *
 * Presenting the bot as an ordinary opponent is deliberate and pre-existing:
 * the server's own queue filler already does exactly this, drawing bot names
 * from the same `randomName()` generator anonymous players get.
 *
 * What it deliberately does NOT do is fake anything the server owns. No
 * `coinsAwarded` message is ever emitted, so an offline win pays no coins and
 * writes no match history. Client-side daily-challenge counters do advance,
 * exactly as they would against a server bot.
 */

/** Questions drawn per local match — mirrors QUESTIONS_PER_MATCH server-side. */
export const LOCAL_QUESTION_BATCH = 30

/**
 * How long the bot waits before the opening kick of a match, on top of its
 * normal thinking time. The lobby plays a found/who-first/3-2-1 sequence
 * (~5s, see PreMatchCountdown) before the match screen mounts and starts
 * listening, so a bot that kicked into that gap would have its kick dropped.
 * Generous on purpose — being a second late is invisible, being early is a
 * frozen match.
 */
export const OPENING_KICK_DELAY_MS = 5_500
/** The same, for a rematch — its countdown skips the "found" beat (~4.1s). */
export const REMATCH_OPENING_KICK_DELAY_MS = 4_500

/** Injected in tests to make timing and dice rolls deterministic. */
export interface LocalMatchDeps {
  rng?: () => number
  /** Defaults to the locale-aware bundled bank, so a local match is in the
   * player's own language like a server-drawn one. */
  loadQuestions?: (count: number) => Promise<Question[]>
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>
  clearTimer?: (handle: ReturnType<typeof setTimeout>) => void
}

/** The player's room identity. The bot takes whichever slot is left. */
const YOU = { id: 'you', name: 'you' }

export interface LocalMatch {
  socket: MultiplayerSocket
  /** The bot's public identity, so the lobby can present it as the opponent. */
  opponent: BotProfile
  youGoFirst: boolean
  questions: Question[]
}

/**
 * Build a ready-to-play local match. Resolves once its questions are drawn, so
 * the caller can hand the lobby a complete `matched` payload rather than leave
 * the player on a spinner with nothing behind it.
 */
export async function createLocalMatch(deps: LocalMatchDeps = {}): Promise<LocalMatch> {
  const rng = deps.rng ?? Math.random
  const loadQuestions = deps.loadQuestions ?? getQuestions
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = deps.clearTimer ?? ((handle) => clearTimeout(handle))

  const opponent = createBotProfile(rng)
  const youGoFirst = rng() < 0.5
  const questions = await loadQuestions(LOCAL_QUESTION_BATCH)

  const messageHandlers = new Set<(message: ServerMessage) => void>()
  const closeHandlers = new Set<() => void>()
  let room: Room = createRoom(YOU, { id: 'bot', name: opponent.name }, youGoFirst)
  let pending: ReturnType<typeof setTimeout> | null = null
  let closed = false

  const yourSlot: PlayerSlot = youGoFirst ? 'a' : 'b'
  const botSlot: PlayerSlot = youGoFirst ? 'b' : 'a'

  const emit = (message: ServerMessage) => {
    if (!closed) messageHandlers.forEach((h) => h(message))
  }

  /** One timer at a time: the bot only ever has a single act outstanding. */
  const after = (ms: number, fn: () => void) => {
    if (pending) clearTimer(pending)
    pending = setTimer(() => {
      pending = null
      if (!closed) fn()
    }, ms)
  }

  /** Resolve one kick and report it from the player's point of view. */
  function resolveKick(slot: PlayerSlot, scored: boolean) {
    room = applyKick(room, slot, scored)
    emit({ type: 'kickResolved', by: slot === yourSlot ? 'you' : 'opponent', scored })
    if (!isMatchOver(room.shootout)) takeBotTurnIfDue()
  }

  /** If the ball is now the bot's, let it "think", then kick. */
  function takeBotTurnIfDue(extraDelayMs = 0) {
    if (isMatchOver(room.shootout) || activeSlot(room.shootout) !== botSlot) return
    after(extraDelayMs + botKickDelayMs(rng), () => resolveKick(botSlot, botScores(opponent, rng)))
  }

  /** The bot accepts every rematch — the player should never wait out a vote
   * that will never land. This is the second of the two votes, so the room
   * resets here and a fresh question batch goes out with it. */
  async function startRematch() {
    room = voteRematch(room, botSlot, () => rng() < 0.5).room
    const nextQuestions = await loadQuestions(LOCAL_QUESTION_BATCH)
    if (closed) return
    emit({
      type: 'rematchStart',
      youGoFirst: room.players.a.id === YOU.id,
      questions: nextQuestions,
    })
    takeBotTurnIfDue(REMATCH_OPENING_KICK_DELAY_MS)
  }

  function handle(message: ClientMessage) {
    switch (message.type) {
      case 'kickResult':
        // Mirrors applyKick's own guard: a kick that isn't ours is ignored.
        if (isMatchOver(room.shootout) || activeSlot(room.shootout) !== yourSlot) return
        resolveKick(yourSlot, message.scored)
        return
      case 'rematchVote':
        room = voteRematch(room, yourSlot, () => rng() < 0.5).room
        emit({ type: 'rematchVotes', count: 1 })
        after(botRematchDelayMs(rng), () => void startRematch())
        return
      case 'leave':
        if (pending) clearTimer(pending)
        pending = null
        return
      default:
        // 'queue'/'cancel' never arrive: a local match starts already paired.
        return
    }
  }

  const socket: MultiplayerSocket = {
    send(message) {
      if (!closed) handle(message)
    },
    onMessage(handler) {
      messageHandlers.add(handler)
      return () => void messageHandlers.delete(handler)
    },
    onClose(handler) {
      if (closed) {
        handler()
        return () => {}
      }
      closeHandlers.add(handler)
      return () => void closeHandlers.delete(handler)
    },
    close() {
      if (closed) return
      closed = true
      if (pending) clearTimer(pending)
      pending = null
      closeHandlers.forEach((h) => h())
    },
  }

  // When the bot kicks first its opening kick is already due, but the match
  // screen won't be listening until the lobby's countdown finishes.
  takeBotTurnIfDue(OPENING_KICK_DELAY_MS)

  return { socket, opponent, youGoFirst, questions }
}
