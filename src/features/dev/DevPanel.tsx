import { useState, useSyncExternalStore } from 'react'
import { LEVELS } from '../../game/levels/manifest'
import { dailyKey } from '../../services/dailyChallenges'
import { devMode, useDevMode } from '../../services/devMode'
import { DAILY_REWARD_CYCLE } from '../../types/daily'
import { authStore } from '../auth/store'
import { challengesStore } from '../challenges/store'
import { levelStore } from '../levels/store'
import { localProgressStore } from '../progress/store'
import { shopStore } from '../shop/store'

const box: React.CSSProperties = {
  position: 'fixed',
  left: 8,
  bottom: 8,
  zIndex: 9999,
  font: '12px/1.4 monospace',
  color: '#fff',
}
const card: React.CSSProperties = {
  background: 'rgba(0,0,0,0.88)',
  border: '1px solid #f5c542',
  padding: 8,
  marginBottom: 6,
  display: 'grid',
  gap: 6,
  width: 220,
}
const btn: React.CSSProperties = { font: 'inherit', padding: '2px 6px', cursor: 'pointer' }

/**
 * Localhost-only controls for the dev account (see services/devMode.ts). Render
 * it only when `devMode.isAvailable()`; the dev-server gate inside devMode means
 * production builds never mount it.
 */
export function DevPanel() {
  const on = useDevMode()
  const [open, setOpen] = useState(false)
  const [level, setLevel] = useState(1)
  const [note, setNote] = useState('')
  const auth = useSyncExternalStore(authStore.subscribe, authStore.getState)

  function setDaily(nextDay: number | null) {
    // nextDay = the day of the cycle the next claim should pay; null = fresh.
    const streak = nextDay === null || nextDay <= 1 ? 0 : nextDay - 1
    const last = nextDay === null || nextDay <= 1 ? null : dailyKey(new Date(Date.now() - 86_400_000))
    if (auth.status === 'signedIn') authStore.devSetDailyReward?.(streak, last)
    else localProgressStore.devSetDailyReward(streak, last)
    setNote(nextDay === null ? 'Daily reward reset' : `Next daily claim: day ${nextDay}`)
  }

  async function claimPrize() {
    const r = await levelStore.claimPrize(level)
    setNote(`Level ${level} prize: ${r.kind}`)
  }

  return (
    <div style={box}>
      {open && (
        <div style={card}>
          <label>
            <input type="checkbox" checked={on} onChange={(e) => devMode.setOn(e.target.checked)} /> Dev account
          </label>
          {on && (
            <>
              <div>
                Daily reward — next claim is day:
                <div>
                  {Array.from({ length: DAILY_REWARD_CYCLE }, (_, i) => i + 1).map((d) => (
                    <button key={d} type="button" style={btn} onClick={() => setDaily(d)}>
                      {d}
                    </button>
                  ))}
                </div>
                <button type="button" style={btn} onClick={() => setDaily(null)}>
                  Reset
                </button>
              </div>
              <div>
                Daily challenges:{' '}
                <button type="button" style={btn} onClick={() => challengesStore.devCompleteAll()}>
                  Complete
                </button>{' '}
                <button type="button" style={btn} onClick={() => challengesStore.devReset()}>
                  Reset
                </button>
              </div>
              <div>
                Level prize:{' '}
                <select value={level} onChange={(e) => setLevel(Number(e.target.value))}>
                  {LEVELS.map((l) => (
                    <option key={l.level} value={l.level}>
                      {l.level}
                    </option>
                  ))}
                </select>{' '}
                <button type="button" style={btn} onClick={() => void claimPrize()}>
                  Claim
                </button>
              </div>
              <div>
                <button
                  type="button"
                  style={btn}
                  onClick={() => {
                    authStore.devShowWelcome?.()
                    setNote(auth.status === 'signedIn' ? 'Welcome notice shown' : 'Sign in to see the welcome notice')
                  }}
                >
                  Replay welcome bonus
                </button>
              </div>
              <div>
                <button type="button" style={btn} onClick={() => void shopStore.refresh()}>
                  Refresh shop ownership
                </button>
              </div>
            </>
          )}
          {note && <div style={{ color: '#f5c542' }}>{note}</div>}
        </div>
      )}
      <button type="button" style={btn} onClick={() => setOpen(!open)}>
        DEV{on ? ' ●' : ''}
      </button>
    </div>
  )
}
