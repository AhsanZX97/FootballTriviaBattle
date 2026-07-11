import { PreMatchCountdown } from '../../lobby/components/PreMatchCountdown'
import type { MatchReadySession } from '../../lobby/store'
import './ChallengeCountdown.css'

type Props = {
  session: MatchReadySession
  onDone: () => void
}

/** Full-screen "MATCH FOUND → who's first → 3-2-1" overlay for an accepted
 * challenge, so it gets the same pre-match beat as quick match. Reuses the
 * lobby's PreMatchCountdown; App swaps to the match screen on `onDone`. */
export function ChallengeCountdown({ session, onDone }: Props) {
  return (
    <div className="challenge-countdown">
      <PreMatchCountdown
        opponentName={session.opponentName}
        youGoFirst={session.youGoFirst}
        onDone={onDone}
      />
    </div>
  )
}
