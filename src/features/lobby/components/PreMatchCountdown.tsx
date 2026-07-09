import { useEffect, useState } from 'react'
import { play } from '../../../services/sound'
import { Sprite } from '../../../components/Sprite'
import './PreMatchCountdown.css'

// ponytail: the "321 countdown" audio runs ~3s, so ticks are 1s to stay in
// step with it — this is the knob if the beeps drift from the numbers.
const TICK_MS = 1000

/** "Found" only applies the first time (a fresh opponent); rematches skip
 * straight to who-goes-first since there's nothing new to announce. */
type Stage = 'found' | 'whoFirst' | 'countdown' | 'go'

type Props = {
  opponentName: string
  youGoFirst: boolean
  onDone: () => void
  skipFoundBeat?: boolean
}

export function PreMatchCountdown({ opponentName, youGoFirst, onDone, skipFoundBeat }: Props) {
  const [stage, setStage] = useState<Stage>(skipFoundBeat ? 'whoFirst' : 'found')
  const [count, setCount] = useState(3)

  useEffect(() => {
    if (stage !== 'found') return
    const t = setTimeout(() => setStage('whoFirst'), 900)
    return () => clearTimeout(t)
  }, [stage])

  useEffect(() => {
    if (stage !== 'whoFirst') return
    const t = setTimeout(() => setStage('countdown'), 1100)
    return () => clearTimeout(t)
  }, [stage])

  // fires once as the count begins, so the audio's 3-2-1 lines up with TICK_MS
  useEffect(() => {
    if (stage === 'countdown') play('countdown')
  }, [stage])

  useEffect(() => {
    if (stage !== 'countdown') return
    if (count <= 0) {
      setStage('go')
      onDone()
      return
    }
    const t = setTimeout(() => setCount((c) => c - 1), TICK_MS)
    return () => clearTimeout(t)
  }, [stage, count, onDone])

  return (
    <div className="pmc">
      {stage === 'found' && (
        <>
          <p className="pmc__status">MATCH FOUND!</p>
          <p className="pmc__opponent">vs {opponentName}</p>
        </>
      )}
      {stage === 'whoFirst' && (
        <p className="pmc__status">
          {youGoFirst ? (
            <>
              YOU GO FIRST <Sprite name="ball" />
            </>
          ) : (
            <>
              {opponentName} GOES FIRST <Sprite name="glove" />
            </>
          )}
        </p>
      )}
      {(stage === 'countdown' || stage === 'go') && (
        <p className="pmc__countdown">{stage === 'countdown' ? count : <Sprite name="ball" />}</p>
      )}
    </div>
  )
}
