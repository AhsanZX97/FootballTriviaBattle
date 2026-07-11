import { CoinCounter } from './CoinCounter'
import { SoundControl } from './SoundControl'
import { FriendsButton } from '../../friends/components/FriendsButton'
import './TopBar.css'

type Props = {
  /** Current app screen. Coin + friends hide during a match; sound stays. */
  screen: string
}

/** Fixed, full-width row that owns the layout of every floating top-bar
 * control. `align-items: center` puts them all on one shared centre line, so
 * individual icons never need hand-tuned `top` offsets. The bar itself ignores
 * pointer events (its empty middle passes clicks through to the screen); each
 * slot re-enables them over its own content. */
export function TopBar({ screen }: Props) {
  const inMatch = screen === 'match'
  return (
    <div className="topbar">
      <div className="topbar__slot topbar__slot--left">{!inMatch && <FriendsButton />}</div>
      <div className="topbar__slot topbar__slot--right">
        {!inMatch && <CoinCounter />}
        <SoundControl screen={screen} />
      </div>
    </div>
  )
}
