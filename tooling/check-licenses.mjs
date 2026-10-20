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

const raw = execFileSync('pnpm', ['licenses', 'list', '--prod', '--json'], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
})
const byLicense = raw.trim() ? JSON.parse(raw) : {}

const offenders = Object.entries(byLicense)
  .filter(([license]) => !ALLOWED.has(license))
  .flatMap(([license, pkgs]) => pkgs.map((p) => `${p.name}@${p.versions.join(',')} (${license})`))

if (offenders.length > 0) {
  console.error('Disallowed licenses in production dependencies:')
  for (const o of offenders) console.error(`  ${o}`)
  process.exit(1)
}
console.log(`License check passed (${Object.values(byLicense).flat().length} production packages).`)
