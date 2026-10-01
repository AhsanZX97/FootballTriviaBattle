const portraits = import.meta.glob<string>('../../assets/players/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
})

const crests = import.meta.glob<string>('../../assets/teams/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
})

/** URL of a picture question's image, or undefined for an unknown key. Club
 * crests are keyed `teams/<id>`; anything else is a player portrait. */
export function playerPortrait(key: string | undefined): string | undefined {
  if (!key) return undefined
  if (key.startsWith('teams/')) return crests[`../../assets/${key}.webp`]
  return portraits[`../../assets/players/${key}.webp`]
}
