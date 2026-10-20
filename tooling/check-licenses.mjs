// Fails when a production dependency has a license outside the allowlist.
// Orbit is Apache-2.0 (ADR 0006), so only permissive licenses are accepted.
import { execFileSync } from 'node:child_process'

const ALLOWED = new Set([
  'Apache-2.0',
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'BlueOak-1.0.0',
  'CC0-1.0',
  'Python-2.0',
  'Unlicense',
])

// Fonts are not code, and the SIL Open Font License is the license Google Fonts uses. It allows
// bundling and redistributing the unmodified fonts, including inside Apache-2.0 software, on the
// condition that the copyright and license text travel with them (apps/web/vite.config.ts emits
// them next to the fonts). The exception covers the Fontsource font packages only, so OFL code
// would still be refused. See ADR 0013.
const ALLOWED_FOR_PACKAGES = new Map([['OFL-1.1', /^@fontsource(-variable)?\//]])

const isAllowed = (license, name) =>
  ALLOWED.has(license) || (ALLOWED_FOR_PACKAGES.get(license)?.test(name) ?? false)

const raw = execFileSync('pnpm', ['licenses', 'list', '--prod', '--json'], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
})
const byLicense = raw.trim() ? JSON.parse(raw) : {}

const offenders = Object.entries(byLicense).flatMap(([license, pkgs]) =>
  pkgs
    .filter((p) => !isAllowed(license, p.name))
    .map((p) => `${p.name}@${p.versions.join(',')} (${license})`),
)

if (offenders.length > 0) {
  console.error('Disallowed licenses in production dependencies:')
  for (const o of offenders) console.error(`  ${o}`)
  process.exit(1)
}
console.log(`License check passed (${Object.values(byLicense).flat().length} production packages).`)
