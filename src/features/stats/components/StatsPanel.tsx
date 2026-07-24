import { useEffect, useSyncExternalStore } from 'react'
import { statsStore, type StatsStore } from '../store'
import type { MatchHistoryEntry } from '../../../types/stats'
import './StatsPanel.css'

type Props = {
  /** Defaults to the real singleton; tests inject a fake. */
  store?: StatsStore
}

/** For a disconnect-ended game, who left — a win means the opponent bailed, a
 * loss means this player did. Null for a clean full-time result. */
function disconnectNote(entry: MatchHistoryEntry): string | null {
  if (!entry.byDisconnect) return null
  return entry.outcome === 'win' ? 'opponent left' : 'you left'
}

/** The STATS tab of the player's account popup: their lifetime win/loss record
 * and a list of their last five games (vs CPU or an opponent's name), each with
 * the score and whether it was won or lost. Refreshes on open. */
export function StatsPanel({ store = statsStore }: Props) {
  const stats = useSyncExternalStore(store.subscribe, store.getState)

  useEffect(() => {
    void store.refresh()
  }, [store])

  const total = stats.wins + stats.losses
  const winRate = total > 0 ? Math.round((stats.wins / total) * 100) : 0
  const loading = stats.status === 'loading' && stats.recent.length === 0

  return (
    <div className="stats-panel">
      {stats.error && <p className="stats-panel__error">{stats.error}</p>}

      <div className="stats-panel__record">
        <div className="stats-panel__stat">
          <span className="stats-panel__num stats-panel__num--win">{stats.wins}</span>
          <span className="stats-panel__label">WINS</span>
        </div>
        <div className="stats-panel__stat">
          <span className="stats-panel__num stats-panel__num--loss">{stats.losses}</span>
          <span className="stats-panel__label">LOSSES</span>
        </div>
        <div className="stats-panel__stat">
          <span className="stats-panel__num">{winRate}%</span>
          <span className="stats-panel__label">WIN RATE</span>
        </div>
      </div>

      <h3 className="stats-panel__heading">MATCH HISTORY</h3>

      {loading ? (
        <p className="stats-panel__hint">Loading…</p>
      ) : stats.recent.length === 0 ? (
        <p className="stats-panel__hint">No matches played yet.</p>
      ) : (
        <ul className="stats-panel__list">
          {stats.recent.map((entry, i) => {
            const note = disconnectNote(entry)
            return (
              <li
                key={`${entry.createdAt}-${i}`}
                className={`stats-panel__row stats-panel__row--${entry.outcome}`}
              >
                <span className={`stats-panel__badge stats-panel__badge--${entry.outcome}`}>
                  {entry.outcome === 'win' ? 'W' : 'L'}
                </span>
                <span className="stats-panel__opponent">
                  <span className="stats-panel__vs">vs {entry.opponentName}</span>
                  {note && <span className="stats-panel__note">{note}</span>}
                </span>
                <span className="stats-panel__score">
                  {entry.userScore}
                  <span className="stats-panel__dash">–</span>
                  {entry.opponentScore}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
