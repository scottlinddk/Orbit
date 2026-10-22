import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  installedFolder,
  installPlanet,
  loadInstalledPlanets,
  readLockfile,
  uninstallPlanetFiles,
  type InstallPrompt,
} from './installer.ts'
import { PlanetError } from './manifest.ts'
import { readPlanetFolder } from './package-folder.ts'

const FIXTURE = new URL('../../fixtures/hello', import.meta.url).pathname
const NOW = new Date('2026-02-03T04:05:06Z')

let work: string
let source: string
let planetsDir: string

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'orbit-planets-'))
  source = join(work, 'source')
  planetsDir = join(work, 'planets')
  cpSync(FIXTURE, source, { recursive: true })
})
afterEach(() => rmSync(work, { recursive: true, force: true }))

const approveAll = async () => true
const install = (overrides: Partial<Parameters<typeof installPlanet>[0]> = {}) =>
  installPlanet({
    sourceDir: source,
    planetsDir,
    orbitVersion: '0.0.0',
    approve: approveAll,
    now: NOW,
    ...overrides,
  })

describe('installPlanet', () => {
  it('shows every permission before installing, then pins version and digest', async () => {
    let prompt: InstallPrompt | undefined
    const result = await install({
      approve: async (p) => {
        prompt = p
        return true
      },
    })
    expect(prompt).toMatchObject({
      id: 'dev.orbit.hello',
      replaces: undefined,
      permissionsChanged: true,
      permissions: ['None: this Planet uses only data inside its own files.'],
    })
    const lock = readLockfile(planetsDir)
    expect(lock.planets['dev.orbit.hello']).toMatchObject({
      version: '1.0.0',
      digest: result.digest,
      installed_at: NOW.toISOString(),
    })
    expect(result.digest).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(loadInstalledPlanets(planetsDir, '0.0.0').planets).toHaveLength(1)
  })

  it('installs nothing when the permissions are not approved', async () => {
    await expect(install({ approve: async () => false })).rejects.toThrow(/not approved/)
    expect(existsSync(installedFolder(planetsDir, 'dev.orbit.hello'))).toBe(false)
    expect(existsSync(join(planetsDir, 'planets.lock'))).toBe(false)
  })

  it('refuses a Planet written for another Orbit version', async () => {
    const manifest = join(source, 'planet.json')
    writeFileSync(manifest, readFileSync(manifest, 'utf8').replace('>=0.0.0 <1.0.0', '>=2.0.0'))
    await expect(install()).rejects.toThrow(/needs Orbit >=2.0.0/)
    expect(existsSync(installedFolder(planetsDir, 'dev.orbit.hello'))).toBe(false)
  })

  it('copies the files, so editing the source afterwards changes nothing', async () => {
    await install()
    writeFileSync(join(source, 'templates', 'main.liquid'), '<p>changed</p>')
    expect(loadInstalledPlanets(planetsDir, '0.0.0').refused).toEqual([])
  })

  it('reports an update and whether its permissions changed', async () => {
    await install()
    const manifest = join(source, 'planet.json')
    writeFileSync(manifest, readFileSync(manifest, 'utf8').replace('"1.0.0"', '"1.1.0"'))
    let prompt: InstallPrompt | undefined
    await install({
      approve: async (p) => {
        prompt = p
        return true
      },
    })
    expect(prompt).toMatchObject({ replaces: '1.0.0', permissionsChanged: false })
    expect(readLockfile(planetsDir).planets['dev.orbit.hello']?.version).toBe('1.1.0')
  })
})

describe('what a Planet folder may contain', () => {
  it('rejects code files, symbolic links and a missing manifest or template', () => {
    writeFileSync(join(source, 'run.js'), 'process.exit()')
    expect(() => readPlanetFolder(source)).toThrow(/cannot carry code/)
    rmSync(join(source, 'run.js'))

    symlinkSync('/etc/passwd', join(source, 'passwd.txt'))
    expect(() => readPlanetFolder(source)).toThrow(/symbolic link/)
    rmSync(join(source, 'passwd.txt'))

    rmSync(join(source, 'templates', 'main.liquid'))
    expect(() => readPlanetFolder(source)).toThrow(PlanetError)
    rmSync(join(source, 'planet.json'))
    expect(() => readPlanetFolder(source)).toThrow(/no planet.json/)
  })

  it('rejects a manifest with code-like fields when installing', async () => {
    const manifest = join(source, 'planet.json')
    writeFileSync(
      manifest,
      JSON.stringify({ ...JSON.parse(readFileSync(manifest, 'utf8')), wasm: 'a.wasm' }),
    )
    await expect(install()).rejects.toThrow(/wasm/)
  })

  it('gives the same digest for the same content wherever the folder is', () => {
    const copy = join(work, 'copy')
    cpSync(FIXTURE, copy, { recursive: true })
    expect(readPlanetFolder(copy).digest).toBe(readPlanetFolder(source).digest)
    writeFileSync(join(copy, 'README.md'), 'edited')
    expect(readPlanetFolder(copy).digest).not.toBe(readPlanetFolder(source).digest)
  })
})

describe('loadInstalledPlanets', () => {
  it('refuses a Planet whose files changed after install (digest mismatch)', async () => {
    await install()
    writeFileSync(
      join(installedFolder(planetsDir, 'dev.orbit.hello'), 'templates', 'main.liquid'),
      '<p>swapped</p>',
    )
    const { planets, refused } = loadInstalledPlanets(planetsDir, '0.0.0')
    expect(planets).toEqual([])
    expect(refused).toEqual([
      { id: 'dev.orbit.hello', reason: expect.stringContaining('digest mismatch') },
    ])
  })

  it('refuses a Planet whose files were swapped for another version or Planet', async () => {
    await install()
    const target = installedFolder(planetsDir, 'dev.orbit.hello')
    const manifest = join(target, 'planet.json')
    writeFileSync(manifest, readFileSync(manifest, 'utf8').replace('"1.0.0"', '"9.9.9"'))
    expect(loadInstalledPlanets(planetsDir, '0.0.0').refused).toHaveLength(1)
  })

  it('refuses everything when the lockfile is damaged, rather than guessing', async () => {
    await install()
    writeFileSync(join(planetsDir, 'planets.lock'), '{ not json')
    expect(() => loadInstalledPlanets(planetsDir, '0.0.0')).toThrow(PlanetError)
  })

  it('ignores a folder that is not in the lockfile', async () => {
    mkdirSync(join(planetsDir, 'installed'), { recursive: true })
    cpSync(FIXTURE, join(planetsDir, 'installed', 'dev.orbit.hello'), { recursive: true })
    expect(loadInstalledPlanets(planetsDir, '0.0.0').planets).toEqual([])
  })
})

describe('uninstallPlanetFiles', () => {
  it('removes the files and the lock entry', async () => {
    await install()
    expect(uninstallPlanetFiles(planetsDir, 'dev.orbit.hello')).toBe(true)
    expect(existsSync(installedFolder(planetsDir, 'dev.orbit.hello'))).toBe(false)
    expect(readLockfile(planetsDir).planets).toEqual({})
    expect(uninstallPlanetFiles(planetsDir, 'dev.orbit.hello')).toBe(false)
  })

  it('refuses an id that could climb out of the Planets folder', () => {
    expect(() => uninstallPlanetFiles(planetsDir, '../../etc')).toThrow(PlanetError)
  })
})
