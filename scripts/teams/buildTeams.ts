/**
 * Builds the "guess the club from its crest" pack from Wikidata + Wikimedia
 * Commons, pixel-stylised like the player portraits.
 *
 *   npx tsx scripts/teams/buildTeams.ts [--limit 120] [--skip name,name]
 *
 * Appends to src/assets/teams/teams.json (the bank derives ids from order, so
 * never reorder). Unlike the player pipeline this does NOT filter by licence:
 * club crests are trademarks. The licence Commons reports is stored per club so
 * the pack can be audited or pruned.
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(HERE, '..', '..', 'src', 'assets', 'teams')
const MANIFEST = join(OUT_DIR, 'teams.json')
const UA = 'FootballTriviaBattle-asset-pipeline/0.1 (dev tooling)'

const args = process.argv.slice(2)
const option = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const LIMIT = Number(option('limit', '120'))
const GRID = Number(option('grid', '56'))
const COLOURS = Number(option('colours', '24'))
const SIZE = 384
const BACKGROUND = '#f4f1e8'

const slug = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
const SKIP = new Set(option('skip', '').split(',').map((s) => slug(s.trim())).filter(Boolean))
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function get(url: string, tries = 5): Promise<Response> {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (res.ok) return res
    if (res.status !== 429 && res.status < 500) throw new Error(`${res.status} for ${url}`)
    await sleep(2000 * (i + 1))
  }
  throw new Error(`gave up on ${url}`)
}

interface Row {
  qid: string
  name: string
  country: string | null
  sitelinks: number
  logo: string | null
  wikiTitle?: string
}

async function candidates(): Promise<Row[]> {
  const query = `SELECT ?item ?itemLabel ?links ?logo ?wikiTitle ?countryLabel WHERE {
    { SELECT ?item ?links WHERE { ?item wdt:P31 wd:Q476028; wikibase:sitelinks ?links. FILTER(?links>40) }
      ORDER BY DESC(?links) LIMIT 400 }
    OPTIONAL { ?item wdt:P154 ?logo }
    OPTIONAL { ?wiki schema:about ?item; schema:isPartOf <https://en.wikipedia.org/>; schema:name ?wikiTitle }
    OPTIONAL { ?item wdt:P17 ?country }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
  }`
  const res = await get(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`)
  const body = (await res.json()) as { results: { bindings: Record<string, { value: string }>[] } }
  const byId = new Map<string, Row>()
  for (const b of body.results.bindings) {
    const qid = b.item.value.split('/').pop()!
    if (byId.has(qid)) continue
    byId.set(qid, {
      qid,
      name: b.itemLabel.value,
      country: b.countryLabel?.value ?? null,
      sitelinks: Number(b.links.value),
      logo: b.logo ? decodeURIComponent(b.logo.value.split('/Special:FilePath/').pop()!) : null,
      wikiTitle: b.wikiTitle?.value,
    })
  }
  return [...byId.values()].sort((a, b) => b.sitelinks - a.sitelinks)
}

async function commonsInfo(file: string) {
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata' +
    `&iiurlwidth=600&titles=${encodeURIComponent(`File:${file}`)}`
  const body = (await (await get(url)).json()) as {
    query: { pages: Record<string, { imageinfo?: { thumburl: string; descriptionurl: string; extmetadata: Record<string, { value: string } | undefined> }[] }> }
  }
  const info = Object.values(body.query.pages)[0]?.imageinfo?.[0]
  if (!info) return null
  return {
    thumbUrl: info.thumburl,
    pageUrl: info.descriptionurl,
    licence: info.extmetadata.LicenseShortName?.value ?? 'unknown',
  }
}

/** Infobox image of the club's English Wikipedia article (its crest). */
async function wikipediaInfo(title: string) {
  const url =
    'https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&pithumbsize=600' +
    `&titles=${encodeURIComponent(title)}`
  const body = (await (await get(url)).json()) as {
    query: { pages: Record<string, { thumbnail?: { source: string } }> }
  }
  const thumb = Object.values(body.query.pages)[0]?.thumbnail?.source
  if (!thumb) return null
  return {
    thumbUrl: thumb,
    pageUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(' ', '_'))}`,
    licence: 'club crest (trademark); Wikipedia infobox image',
  }
}

async function stylise(buf: Buffer, outPath: string) {
  const trimmed = await sharp(buf).ensureAlpha().trim({ background: '#00000000', threshold: 10 }).toBuffer().catch(() => buf)
  const inner = Math.round(GRID * 0.9)
  const small = await sharp(trimmed)
    .resize(inner, inner, { fit: 'contain', background: '#00000000' })
    .extend({
      top: Math.floor((GRID - inner) / 2),
      bottom: Math.ceil((GRID - inner) / 2),
      left: Math.floor((GRID - inner) / 2),
      right: Math.ceil((GRID - inner) / 2),
      background: '#00000000',
    })
    .flatten({ background: BACKGROUND })
    .png({ palette: true, colours: COLOURS, dither: 0 })
    .toBuffer()
  await sharp(small).resize(SIZE, SIZE, { kernel: 'nearest' }).webp({ lossless: true }).toFile(outPath)
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const manifest: Record<string, unknown>[] = existsSync(MANIFEST) ? JSON.parse(await readFile(MANIFEST, 'utf8')) : []
  const have = new Set(manifest.map((t) => t.wikidata))
  const ids = new Set(manifest.map((t) => t.id))
  let added = 0

  for (const row of await candidates()) {
    if (added >= LIMIT) break
    const id = slug(row.name)
    if (have.has(row.qid) || ids.has(id) || SKIP.has(id)) continue
    try {
      const info = row.logo ? await commonsInfo(row.logo) : row.wikiTitle ? await wikipediaInfo(row.wikiTitle) : null
      await sleep(400)
      if (!info) continue
      const png = Buffer.from(await (await get(info.thumbUrl)).arrayBuffer())
      await sleep(400)
      await stylise(png, join(OUT_DIR, `${id}.webp`))
      manifest.push({
        id,
        name: row.name,
        wikidata: row.qid,
        country: row.country,
        sitelinks: row.sitelinks,
        image: `${id}.webp`,
        credit: { licence: info.licence, source: info.pageUrl, changes: 'Converted to pixel art' },
      })
      ids.add(id)
      added++
      console.log(`+ ${added} ${row.name} (${info.licence})`)
    } catch (err) {
      console.warn(`- ${row.name}: ${(err as Error).message}`)
    }
  }
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
  console.log(`teams.json now has ${manifest.length}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})


