import ronaldoThumb from '../../../assets/ronaldo-thumb.png'
import './ShopItemList.css'

type Striker = { id: string; name: string; thumb?: string; available: boolean }

const STRIKERS: Striker[] = [
  { id: 'default', name: 'Default Striker', available: true },
  { id: 'ronaldo', name: 'Ronaldo', thumb: ronaldoThumb, available: false },
]

/** Striker cosmetics. Only the stock striker exists as a real option for now;
 * Ronaldo is listed greyed out and can't be tapped until he ships. */
export function StrikerShelf() {
  return (
    <ul className="shop-items">
      {STRIKERS.map((striker) => (
        <li key={striker.id} className="shop-items__row">
          {striker.thumb && (
            <span className="shop-items__preview shop-items__preview--static" aria-hidden>
              <img
                className="shop-items__preview-img shop-items__preview-img--thumb shop-items__preview-img--fit"
                src={striker.thumb}
                alt=""
              />
            </span>
          )}
          <button
            type="button"
            className={`shop-items__main${striker.available ? '' : ' shop-items__main--locked'}`}
            aria-label={striker.name}
            disabled={!striker.available}
          >
            <span className="shop-items__name">{striker.name}</span>
            <span className="shop-items__tag shop-items__tag--equipped">
              {striker.available ? 'EQUIPPED' : 'COMING SOON'}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
