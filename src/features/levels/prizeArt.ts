import chestClosed from '../../assets/levels/chest-closed.png'
import volumeIcon from '../../assets/volume-icon.png'
import type { LevelPrize } from '../../game/levels/rewards'
import { BALL_SKIN_SOURCES, GK_SKIN_SOURCES, findItem } from '../../services/shopCatalogue'

/** Picture and name for a level prize. Goal sounds have no art of their own,
 * so they borrow the shop's speaker icon. */
export function prizeArt(prize: LevelPrize): { src: string; name: string } {
  if (prize.kind === 'coins') return { src: chestClosed, name: `${prize.coins} coins` }
  const item = findItem(prize.itemId)
  const name = item?.name ?? prize.itemId
  if (item?.slot === 'ballSkin') return { src: BALL_SKIN_SOURCES[item.id]?.thumb ?? volumeIcon, name }
  if (item?.slot === 'gkSkin') return { src: GK_SKIN_SOURCES[item.id]?.thumb ?? volumeIcon, name }
  return { src: volumeIcon, name }
}
