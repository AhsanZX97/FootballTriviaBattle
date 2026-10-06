import { useEffect, useRef, useState } from 'react'
import { useT } from '../../../services/i18n/store'
import type { MessageKey } from '../../../services/i18n/messages/en'
import { loadPitchGame } from '../engine/loadPitchGame'
import type { PitchCallbacks, PitchGame, PitchState } from '../engine/contracts'
import type { PitchSkins } from '../engine/pitchArt'
import type { KeeperReaction, SceneFeedback } from '../engine/shotTimeline'
import './PitchScene.css'

export type { SceneFeedback } from '../engine/shotTimeline'

const LABEL_KEYS = {
  goal: 'scene.goal', miss: 'scene.miss', save: 'scene.saved',
} as const satisfies Partial<Record<SceneFeedback, MessageKey>>

type Props = PitchSkins & {
  feedback: SceneFeedback | null
  opponentLabel?: string
  dimmed?: boolean
  reaction?: KeeperReaction
  striker?: boolean
  onEvent?: PitchCallbacks['onEvent']
}

/** Accessible React host for a persistent Phaser scene. No DOM actors or clocks. */
export function PitchScene({ stage, feedback, opponentLabel, ballSkin, gkSkin, opponentGkSkin, dimmed = false, reaction, striker, onEvent }: Props) {
  const t = useT()
  const host = useRef<HTMLDivElement>(null)
  const game = useRef<PitchGame | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  const label = feedback === 'concede'
    ? t('scene.scores', { name: opponentLabel ?? t('match.opponent') })
    : feedback ? t(LABEL_KEYS[feedback]) : null
  const state: PitchState = { stage, feedback, label, ballSkin, gkSkin, opponentGkSkin, dimmed, reaction, striker }
  const latest = useRef({ state, onEvent })
  latest.current = { state, onEvent }

  useEffect(() => {
    let cancelled = false
    let instance: PitchGame | null = null
    // Wait for the bundled font before Phaser measures canvas text.
    const font = document.fonts?.load('16px "Press Start 2P"') ?? Promise.resolve()
    Promise.all([loadPitchGame(), font]).then(([{ createPitchGame }]) => {
      if (cancelled || !host.current) return
      instance = createPitchGame(host.current, latest.current.state, {
        onEvent: (event, outcome) => { if (!cancelled) latest.current.onEvent?.(event, outcome) },
        onReady: () => { if (!cancelled) setStatus((s) => s === 'error' ? s : 'ready') },
        onError: () => { if (!cancelled) setStatus('error') },
      })
      game.current = instance
    }).catch(() => { if (!cancelled) setStatus('error') })
    return () => {
      cancelled = true
      instance?.destroy()
      game.current = null
    }
  }, [attempt])

  useEffect(() => { game.current?.update(latest.current.state) }, [stage, feedback, label, ballSkin, gkSkin, opponentGkSkin, dimmed, reaction, striker])

  return (
    <div className="scene">
      <div ref={host} className="scene__canvas" role="img"
        aria-label={label ?? (stage === 'shoot' ? t('scene.shootingAria') : t('scene.keepingAria'))} />
      <span className="scene__accessible" role="status">{label}</span>
      {status === 'loading' && !dimmed && <p className="scene__notice">Loading pitch…</p>}
      {status === 'error' && (
        <div className="scene__notice" role="alert">
          <p>The pitch couldn’t load.</p>
          <button type="button" className="match__answer" onClick={() => {
            setStatus('loading')
            setAttempt((value) => value + 1)
          }}>Retry pitch</button>
        </div>
      )}
    </div>
  )
}
