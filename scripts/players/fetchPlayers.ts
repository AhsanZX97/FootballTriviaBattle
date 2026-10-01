/**
 * Builds the "guess the player" portrait pack from Wikidata + Wikimedia Commons.
 *
 *   npx tsx scripts/players/fetchPlayers.ts --limit 10 --dry-run
 *
 * Fame is ranked by Wikipedia sitelink count. Only photos under a licence that
 * allows commercial reuse with modification are kept; everything else is
 * skipped and the next-ranked player takes its place.
 */

import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { faceCrop, type Crop } from './faceCrop.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const RAW_DIR = join(HERE, '.cache', 'raw')

const slug = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

// Wikidata labels that would be ambiguous as a quiz answer next to Cristiano.
const DISPLAY_NAMES: Record<string, string> = { Ronaldo: 'Ronaldo Nazário' }

const USER_AGENT =
  'FootballTriviaBattle-asset-pipeline/0.1 (https://play.google.com/store/apps/details?id=com.footballtriviabattle; dev tooling)'

const ALLOWED_LICENCE = /^(cc0|public domain|pd\b|cc[ -]by(-sa)?[ -][\d.]+)/i

interface Candidate {
  qid: string
  name: string
  sitelinks: number
  images: string[]
}

interface Licensed {
  file: string
  licence: string
  licenceUrl: string
  artist: string
  pageUrl: string
  thumbUrl: string
}

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(`--${name}`)
const option = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

/** Number of NEW players to add on top of those already in players.json. */
const LIMIT = Number(option('limit', '10'))
const DRY_RUN = flag('dry-run')
const MIN_LINKS = Number(option('min-links', '40'))
const SKIP = new Set(
  option('skip', '')
    .split(',')
    .map((s) => slug(s.trim()))
    .filter(Boolean),
)
const MANIFEST = join(HERE, '..', '..', 'src', 'assets', 'players', 'players.json')

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  return (await res.json()) as T
}

async function sparql<T>(query: string): Promise<T[]> {
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`
  const body = await getJson<{ results: { bindings: T[] } }>(url)
  return body.results.bindings
}

type Binding = Record<string, { value: string } | undefined>

async function fetchCandidates(pool: number): Promise<Candidate[]> {
  const rows = await sparql<Binding>(`
    SELECT ?item ?itemLabel ?links ?image WHERE {
      {
        SELECT ?item ?links WHERE {
          ?item wdt:P106 wd:Q937857 ;
                wikibase:sitelinks ?links .
          FILTER(?links > ${MIN_LINKS})
        }
        ORDER BY DESC(?links)
        LIMIT ${pool * 4}
      }
      # Amateur players (Camus, Connery...) carry the occupation too; only real
      # footballers have a "country for sport".
      FILTER EXISTS { ?item wdt:P1532 [] }
      OPTIONAL { ?item wdt:P18 ?image }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
    }
    ORDER BY DESC(?links)
    LIMIT ${pool * 4}
  `)

  const byId = new Map<string, Candidate>()
  for (const row of rows) {
    const qid = row.item!.value.split('/').pop()!
    const existing = byId.get(qid) ?? {
      qid,
      name: DISPLAY_NAMES[row.itemLabel!.value] ?? row.itemLabel!.value,
      sitelinks: Number(row.links!.value),
      images: [],
    }
    const image = row.image?.value
    if (image) {
      const file = decodeURIComponent(image.split('/Special:FilePath/').pop()!)
      if (!existing.images.includes(file)) existing.images.push(file)
    }
    byId.set(qid, existing)
  }
  return [...byId.values()].sort((a, b) => b.sitelinks - a.sitelinks).slice(0, pool)
}

const stripHtml = (html: string) =>
  html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()

async function fetchLicence(file: string): Promise<Licensed | null> {
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo' +
    '&iiprop=url|extmetadata&iiurlwidth=800&titles=' +
    encodeURIComponent(`File:${file}`)
  type Info = {
    query: {
      pages: Record<
        string,
        {
          imageinfo?: {
            thumburl: string
            descriptionurl: string
            extmetadata: Record<string, { value: string } | undefined>
          }[]
        }
      >
    }
  }
  const body = await getJson<Info>(url)
  const info = Object.values(body.query.pages)[0]?.imageinfo?.[0]
  if (!info) return null
  const meta = info.extmetadata
  return {
    file,
    licence: meta.LicenseShortName?.value ?? 'unknown',
    licenceUrl: meta.LicenseUrl?.value ?? '',
    artist: stripHtml(meta.Artist?.value ?? 'unknown'),
    pageUrl: info.descriptionurl,
    thumbUrl: info.thumburl,
  }
}

interface Meta {
  sitelinks: number
  born: number | null
}

async function main() {
  const existing: { wikidata: string }[] = existsSync(MANIFEST)
    ? JSON.parse(await readFile(MANIFEST, 'utf8'))
    : []
  const have = new Set(existing.map((p) => p.wikidata))

  const ranked = await fetchCandidates((existing.length + LIMIT) * 3)
  const candidates = ranked.filter((c) => !have.has(c.qid) && !SKIP.has(slug(c.name)))
  const picked: { candidate: Candidate; photo: Licensed; crop: Crop | null }[] = []
  const skipped: { name: string; reason: string }[] = []

  if (!DRY_RUN) await mkdir(RAW_DIR, { recursive: true })

  for (const candidate of candidates) {
    if (picked.length >= LIMIT) break
    let photo: Licensed | null = null
    let reason = 'no photo on Wikidata'
    let crop: Crop | null = null
    for (const file of candidate.images) {
      const info = await fetchLicence(file)
      await sleep(250)
      if (!info || !ALLOWED_LICENCE.test(info.licence)) {
        reason = `licence not allowed: ${info?.licence ?? 'unknown'}`
        continue
      }
      if (DRY_RUN) {
        photo = info
        break
      }
      const res = await fetch(info.thumbUrl, { headers: { 'User-Agent': USER_AGENT } })
      await sleep(250)
      if (!res.ok) {
        reason = `download failed: ${res.status}`
        continue
      }
      const rawPath = join(RAW_DIR, `${slug(candidate.name)}.jpg`)
      await writeFile(rawPath, Buffer.from(await res.arrayBuffer()))
      crop = await faceCrop(rawPath)
      if (!crop) {
        reason = 'no face detected'
        continue
      }
      photo = info
      break
    }
    if (photo) {
      picked.push({ candidate, photo, crop })
      console.log(`+ ${picked.length}/${LIMIT} ${candidate.name} (${photo.licence})`)
    } else {
      skipped.push({ name: candidate.name, reason })
    }
  }

  console.log(`\nPicked ${picked.length}/${LIMIT} new players`)
  if (skipped.length) {
    console.log('\nSkipped:')
    skipped.forEach((s) => console.log(`  - ${s.name}: ${s.reason}`))
  }
  if (DRY_RUN) return

  const details = await fetchDetails([
    ...existing.map((p) => p.wikidata),
    ...picked.map((p) => p.candidate.qid),
  ])
  const records = picked.map(({ candidate, photo, crop }) => ({
    id: slug(candidate.name),
    qid: candidate.qid,
    name: candidate.name,
    sitelinks: candidate.sitelinks,
    country: details.get(candidate.qid)?.country ?? null,
    positions: details.get(candidate.qid)?.positions ?? [],
    born: details.get(candidate.qid)?.born ?? null,
    crop,
    photo,
  }))
  await writeFile(join(HERE, '.cache', 'candidates.json'), JSON.stringify(records, null, 2))

  // Fame/era for players already shipped, so the bank can rank and group them.
  const links = new Map(ranked.map((c) => [c.qid, c.sitelinks]))
  const meta: Record<string, Meta> = {}
  for (const { wikidata } of existing) {
    meta[wikidata] = {
      sitelinks: links.get(wikidata) ?? 0,
      born: details.get(wikidata)?.born ?? null,
    }
  }
  await writeFile(join(HERE, '.cache', 'meta.json'), JSON.stringify(meta, null, 2))
  console.log(`\nWrote ${records.length} records to .cache/candidates.json`)
}

async function fetchDetails(qids: string[]) {
  const out = new Map<string, { country: string | null; positions: string[]; born: number | null }>()
  for (let i = 0; i < qids.length; i += 60) {
    const rows = await sparql<Binding>(`
      SELECT ?item ?countryLabel ?positionLabel ?born WHERE {
        VALUES ?item { ${qids.slice(i, i + 60).map((q) => `wd:${q}`).join(' ')} }
        OPTIONAL { ?item wdt:P1532 ?country }
        OPTIONAL { ?item wdt:P413 ?position }
        OPTIONAL { ?item wdt:P569 ?born }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
      }
    `)
    for (const row of rows) {
      const qid = row.item!.value.split('/').pop()!
      const year = row.born ? Number.parseInt(row.born.value, 10) : null
      const entry = out.get(qid) ?? {
        country: row.countryLabel?.value ?? null,
        positions: [],
        born: year && Number.isFinite(year) ? year : null,
      }
      const position = row.positionLabel?.value
      if (position && !entry.positions.includes(position)) entry.positions.push(position)
      out.set(qid, entry)
    }
    await sleep(500)
  }
  return out
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

