import { useEffect, useState } from 'react'
import './PreMatchCountdown.css'

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

  useEffect(() => {
    if (stage !== 'countdown') return
    if (count <= 0) {
      setStage('go')
      onDone()
      return
    }
    const t = setTimeout(() => setCount((c) => c - 1), 700)
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
        <p className="pmc__status">{youGoFirst ? 'YOU GO FIRST ⚽' : `${opponentName} GOES FIRST 🧤`}</p>
      )}
      {(stage === 'countdown' || stage === 'go') && (
        <p className="pmc__countdown">{stage === 'countdown' ? count : '⚽'}</p>
      )}
    </div>
  )
}
