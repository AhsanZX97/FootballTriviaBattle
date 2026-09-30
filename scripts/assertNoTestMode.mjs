// Release gate: the dev-only test mode must be compiled out of the Play build.
// Matches its lazy chunk, its class names and the menu label; any hit in dist/
// means the __TEST_MODE__ gating broke somewhere. The bare `onTestMode` prop
// name is expected to survive minification and is harmless on its own.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const MARKER = /TestModeScreen|testmode__|intro__testmode|TEST MODE/
const root = 'dist'

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)],
  )
}

const leaks = files(root).filter(
  (file) => /\.(js|css|html)$/.test(file) && (MARKER.test(file) || MARKER.test(readFileSync(file, 'utf8'))),
)

if (leaks.length) {
  console.error(`Test mode leaked into the release build:\n  ${leaks.join('\n  ')}`)
  process.exit(1)
}
console.log('Release build is free of test mode.')
