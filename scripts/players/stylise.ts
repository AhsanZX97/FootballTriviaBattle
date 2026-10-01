/**
 * Turns the raw Commons photos from fetchPlayers.ts into pixel-art portraits and
 * APPENDS them to src/assets/players/players.json (existing entries keep their
 * position: the question bank derives its ids from that order).
 *
 *   npx tsx scripts/players/stylise.ts [--grid 40] [--colours 12]
 *
 * Crops come from crops.json (hand-authored overrides, used by the first ten
 * players) or, for everyone else, the face-detected crop stored by
 * fetchPlayers.ts. They are fractions (x and size of the width, y of the
 * height) so they survive a re-download at another size.
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import type { Crop } from './faceCrop.ts'

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
const TILE = 192
const PAGE = 32

interface CandidateRecord {
  id: string
  qid: string
  name: string
  sitelinks: number
  country: string | null
  positions: string[]
  born: number | null
  crop: Crop | null
  photo: {
    file: string
    licence: string
    licenceUrl: string
    artist: string
    pageUrl: string
  }
}

interface ManifestEntry {
  id: string
  name: string
  wikidata: string
  country: string | null
  positions: string[]
  born?: number | null
  sitelinks?: number
  image: string
  credit: unknown
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

async function readJson<T>(path: string, fallback: T): Promise<T> {
  return existsSync(path) ? (JSON.parse(await readFile(path, 'utf8')) as T) : fallback
}

async function main() {
  const records = await readJson<CandidateRecord[]>(join(CACHE, 'candidates.json'), [])
  const meta = await readJson<Record<string, { sitelinks: number; born: number | null }>>(
    join(CACHE, 'meta.json'),
    {},
  )
  const crops = await readJson<Record<string, Crop>>(join(HERE, 'crops.json'), {})
  const manifest = await readJson<ManifestEntry[]>(join(OUT_DIR, 'players.json'), [])
  await mkdir(OUT_DIR, { recursive: true })

  for (const entry of manifest) {
    const m = meta[entry.wikidata]
    if (m) Object.assign(entry, { born: m.born, sitelinks: m.sitelinks })
  }

  const known = new Set(manifest.map((p) => p.id))
  const pages: { input: Buffer; left: number; top: number }[][] = []
  let added = 0

  for (const record of records) {
    if (known.has(record.id)) continue
    const raw = join(CACHE, 'raw', `${record.id}.jpg`)
    const crop = crops[record.id] ?? record.crop ?? undefined
    if (!crop) console.warn(`No crop for ${record.id} — using a centred top crop`)

    const portrait = await pixelate(raw, crop)
    await portrait.clone().webp({ lossless: true }).toFile(join(OUT_DIR, `${record.id}.webp`))

    const before = await (await cropSquare(raw, crop)).resize(TILE, TILE).png().toBuffer()
    const after = await portrait.resize(TILE, TILE, { kernel: 'nearest' }).png().toBuffer()
    const col = added % 8
    const row = Math.floor((added % PAGE) / 8)
    const page = Math.floor(added / PAGE)
    ;(pages[page] ??= []).push(
      { input: before, left: col * TILE, top: row * 2 * TILE },
      { input: after, left: col * TILE, top: (row * 2 + 1) * TILE },
    )
    added++

    manifest.push({
      id: record.id,
      name: record.name,
      wikidata: record.qid,
      country: record.country,
      positions: record.positions,
      born: record.born,
      sitelinks: record.sitelinks,
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

  if (added) {
    // Rows alternate source photo / pixelated result, in the order added, so
    // a bad one can be spotted by name and dropped with --skip.
    for (const [i, tiles] of pages.entries()) {
      const rows = Math.ceil(tiles.length / 16)
      await sharp({
        create: { width: 8 * TILE, height: rows * 2 * TILE, channels: 3, background: '#111' },
      })
        .composite(tiles)
        .jpeg({ quality: 80 })
        .toFile(join(CACHE, `contact-sheet-${i + 1}.jpg`))
    }
    console.log(
      'Order on sheet: ' +
        records
          .filter((r) => !known.has(r.id))
          .map((r, i) => `${i + 1}.${r.id}`)
          .join(' '),
    )
  }

  console.log(`Added ${added} portraits; players.json now has ${manifest.length}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
