const portraits = import.meta.glob<string>('../../assets/players/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
})

/** URL of a picture question's portrait, or undefined for an unknown key. */
export function playerPortrait(key: string | undefined): string | undefined {
  return key ? portraits[`../../assets/players/${key}.webp`] : undefined
}
