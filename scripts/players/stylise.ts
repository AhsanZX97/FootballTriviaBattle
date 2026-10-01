/**
 * Turns the raw Commons photos from fetchPlayers.ts into pixel-art portraits.
 *
 *   npx tsx scripts/players/stylise.ts [--grid 48] [--colours 20]
 *
 * Crop boxes live in crops.json so every portrait is a head-and-shoulders
 * square with kit crests and sponsors cut out. They are fractions (x and size
 * of the width, y of the height) so they survive a re-download at another size.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const HERE = dirname(fileURLToPath(import.meta.url))
const CACHE = join(HERE, '.cache')
const OUT_DIR = join(HERE, '..', '..', 'src', 'assets', 'players')

const args = process.argv.slice(2)
const option = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

const GRID = Number(option('grid', '40'))
const COLOURS = Number(option('colours', '12'))
const OUTPUT_SIZE = 384

interface Crop {
  x: number
  y: number
  size: number
}

interface CandidateRecord {
  id: string
  qid: string
  name: string
  country: string | null
  positions: string[]
  photo: {
    file: string
    licence: string
    licenceUrl: string
    artist: string
    pageUrl: string
  }
}

async function cropSquare(rawPath: string, crop: Crop | undefined) {
  const image = sharp(rawPath)
  const { width = 0, height = 0 } = await image.metadata()
  const size = Math.min(crop ? crop.size * width : Math.min(width, height), width, height)
  const left = Math.max(0, Math.min(crop ? crop.x * width : (width - size) / 2, width - size))
  const top = Math.max(0, Math.min(crop ? crop.y * height : 0, height - size))
  return image.extract({
    left: Math.round(left),
    top: Math.round(top),
    width: Math.round(size),
    height: Math.round(size),
  })
}

async function pixelate(rawPath: string, crop: Crop | undefined) {
  // The median pass flattens skin, hair and shirts into solid regions first, so
  // the palette step produces clean colour blocks instead of noisy dithering.
  const smoothed = await (await cropSquare(rawPath, crop))
    .resize(256, 256)
    .median(7)
    .modulate({ saturation: 1.3 })
    .linear(1.15, -12)
    .toBuffer()
  const small = await sharp(smoothed)
    .resize(GRID, GRID, { kernel: 'lanczos3' })
    .png({ palette: true, colours: COLOURS, dither: 0 })
    .toBuffer()
  return sharp(small).resize(OUTPUT_SIZE, OUTPUT_SIZE, { kernel: 'nearest' })
}

async function main() {
  const records: CandidateRecord[] = JSON.parse(await readFile(join(CACHE, 'candidates.json'), 'utf8'))
  const crops: Record<string, Crop> = JSON.parse(await readFile(join(HERE, 'crops.json'), 'utf8'))
  await mkdir(OUT_DIR, { recursive: true })

  const tiles: { input: Buffer; left: number; top: number }[] = []
  const manifest = []

  for (const [i, record] of records.entries()) {
    const raw = join(CACHE, 'raw', `${record.id}.jpg`)
    const crop = crops[record.id]
    if (!crop) console.warn(`No crop for ${record.id} — using a centred top crop`)

    const portrait = await pixelate(raw, crop)
    await portrait.clone().webp({ lossless: true }).toFile(join(OUT_DIR, `${record.id}.webp`))

    const before = await (await cropSquare(raw, crop))
      .resize(OUTPUT_SIZE, OUTPUT_SIZE)
      .png()
      .toBuffer()
    const after = await portrait.png().toBuffer()
    const col = i % 5
    const row = Math.floor(i / 5)
    tiles.push({ input: before, left: col * OUTPUT_SIZE, top: row * 2 * OUTPUT_SIZE })
    tiles.push({ input: after, left: col * OUTPUT_SIZE, top: (row * 2 + 1) * OUTPUT_SIZE })

    manifest.push({
      id: record.id,
      name: record.name,
      wikidata: record.qid,
      country: record.country,
      positions: record.positions,
      image: `${record.id}.webp`,
      credit: {
        author: record.photo.artist,
        licence: record.photo.licence,
        licenceUrl: record.photo.licenceUrl,
        source: record.photo.pageUrl,
        changes: 'Cropped and converted to pixel art',
      },
    })
  }

  await writeFile(join(OUT_DIR, 'players.json'), JSON.stringify(manifest, null, 2) + '\n')

  const rows = Math.ceil(records.length / 5)
  await sharp({
    create: {
      width: 5 * OUTPUT_SIZE,
      height: rows * 2 * OUTPUT_SIZE,
      channels: 3,
      background: '#111',
    },
  })
    .composite(tiles)
    .jpeg({ quality: 80 })
    .toFile(join(CACHE, 'contact-sheet.jpg'))

  console.log(`Wrote ${manifest.length} portraits + players.json to ${OUT_DIR}`)
  console.log(`Contact sheet: ${join(CACHE, 'contact-sheet.jpg')}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
