import ball from '../assets/sprites/ball.png'
import coin from '../assets/sprites/coin.png'
import dice from '../assets/sprites/dice.png'
import disconnect from '../assets/sprites/disconnect.png'
import glove from '../assets/sprites/glove.png'
import miss from '../assets/sprites/miss.png'
import skull from '../assets/sprites/skull.png'
import trophy from '../assets/sprites/trophy.png'
import warning from '../assets/sprites/warning.png'
import './Sprite.css'

const SPRITES = {
  ball,
  coin,
  dice,
  disconnect,
  glove,
  miss,
  skull,
  trophy,
  warning,
} as const

export type SpriteName = keyof typeof SPRITES

type Props = {
  name: SpriteName
  /** Extra class for standalone/oversized placements; base size is 1em. */
  className?: string
}

/** Themed icon that replaces the game's emoji. Sized to 1em so it tracks the
 * surrounding font-size and sits inline like the glyph it replaced; decorative
 * by default (the adjacent text carries the meaning). */
export function Sprite({ name, className }: Props) {
  return (
    <img
      src={SPRITES[name]}
      alt=""
      aria-hidden
      className={className ? `sprite ${className}` : 'sprite'}
    />
  )
}
