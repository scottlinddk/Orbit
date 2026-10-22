import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import semver from 'semver'
import {
  emptyLockfile,
  LOCKFILE_NAME,
  parseLockfile,
  serializeLockfile,
  withEntry,
  withoutEntry,
  type Lockfile,
} from './lockfile.ts'
import { describePermissions, PLANET_ID, PlanetError } from './manifest.ts'
import { readPlanetFolder, type PlanetPackage } from './package-folder.ts'

const INSTALLED_DIR = 'installed'

const sha256 = (text: string) => `sha256:${createHash('sha256').update(text).digest('hex')}`

export const permissionsDigest = (pkg: PlanetPackage) =>
  sha256(describePermissions(pkg.manifest).join('\n'))

export function readLockfile(planetsDir: string): Lockfile {
  const file = join(planetsDir, LOCKFILE_NAME)
  return existsSync(file) ? parseLockfile(readFileSync(file, 'utf8')) : emptyLockfile()
}

function writeLockfile(planetsDir: string, lockfile: Lockfile) {
  mkdirSync(planetsDir, { recursive: true })
  const file = join(planetsDir, LOCKFILE_NAME)
  const temp = `${file}.${randomBytes(4).toString('hex')}.tmp`
  writeFileSync(temp, serializeLockfile(lockfile), { mode: 0o644 })
  renameSync(temp, file)
}

export const installedFolder = (planetsDir: string, id: string) =>
  join(planetsDir, INSTALLED_DIR, id)

/** Whether this Orbit version is inside the range the manifest was written for. */
export const orbitCompatible = (range: string, orbitVersion: string) =>
  semver.satisfies(orbitVersion, range, { includePrerelease: true })

export interface InstallPrompt {
  readonly id: string
  readonly name: string
  readonly version: string
  /** The version being replaced, when this is an update. */
  readonly replaces: string | undefined
  /** True when the permissions differ from the installed version, or this is a new install. */
  readonly permissionsChanged: boolean
  /** Every capability the Planet declares. Anything not listed is denied. */
  readonly permissions: readonly string[]
}

export interface InstallOptions {
  readonly sourceDir: string
  readonly planetsDir: string
  readonly orbitVersion: string
  /** Shows the permissions to the administrator. Returning false aborts with nothing changed. */
  readonly approve: (prompt: InstallPrompt) => Promise<boolean>
  readonly now: Date
}

export interface InstallResult {
  readonly id: string
  readonly version: string
  readonly digest: string
  readonly replaced: string | undefined
}

/**
 * Installs a Planet from a folder on this server. The folder is validated first, the
 * administrator approves every declared permission, and the files are copied into the Planets
 * folder, so editing the source afterwards changes nothing until it is installed again. The
 * lockfile then pins the version and the content digest.
 */
export async function installPlanet(options: InstallOptions): Promise<InstallResult> {
  const pkg = readPlanetFolder(options.sourceDir)
  const { manifest } = pkg
  if (!orbitCompatible(manifest.orbit, options.orbitVersion)) {
    throw new PlanetError(
      `${manifest.name} needs Orbit ${manifest.orbit}, but this is Orbit ${options.orbitVersion}.`,
      [{ path: 'orbit', message: `does not match ${options.orbitVersion}` }],
    )
  }
  const lock = readLockfile(options.planetsDir)
  const current = lock.planets[manifest.id]
  const permissions = permissionsDigest(pkg)
  const approved = await options.approve({
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    replaces: current?.version,
    permissionsChanged: current?.permissions !== permissions,
    permissions: describePermissions(manifest),
  })
  if (!approved) throw new PlanetError('Not installed: the permissions were not approved.')

  const target = installedFolder(options.planetsDir, manifest.id)
  const staging = `${target}.${randomBytes(4).toString('hex')}.staging`
  try {
    for (const file of pkg.files) {
      const destination = join(staging, ...file.path.split('/'))
      mkdirSync(dirname(destination), { recursive: true })
      writeFileSync(destination, file.content, { mode: 0o644 })
    }
    rmSync(target, { recursive: true, force: true })
    renameSync(staging, target)
  } catch (error) {
    rmSync(staging, { recursive: true, force: true })
    throw error
  }
  writeLockfile(
    options.planetsDir,
    withEntry(lock, manifest.id, {
      version: manifest.version,
      digest: pkg.digest,
      permissions,
      installed_at: options.now.toISOString(),
    }),
  )
  return {
    id: manifest.id,
    version: manifest.version,
    digest: pkg.digest,
    replaced: current?.version,
  }
}

/** Removes the files and the lock entry. Stored state and secrets are removed by the runtime. */
export function uninstallPlanetFiles(planetsDir: string, id: string): boolean {
  if (!PLANET_ID.test(id)) throw new PlanetError(`"${id}" is not a Planet id.`)
  const lock = readLockfile(planetsDir)
  const known = id in lock.planets
  rmSync(installedFolder(planetsDir, id), { recursive: true, force: true })
  if (known) writeLockfile(planetsDir, withoutEntry(lock, id))
  return known
}

export interface RefusedPlanet {
  readonly id: string
  readonly reason: string
}

export interface LoadedPlanets {
  readonly planets: readonly PlanetPackage[]
  /** Planets that are in the lockfile but were not loaded, and why. Shown to the administrator. */
  readonly refused: readonly RefusedPlanet[]
}

/**
 * Loads every installed Planet and checks it against the lockfile. A Planet whose files no
 * longer match the pinned digest is refused, not loaded: someone or something changed it after
 * the administrator approved it.
 */
export function loadInstalledPlanets(planetsDir: string, orbitVersion: string): LoadedPlanets {
  const lock = readLockfile(planetsDir)
  const planets: PlanetPackage[] = []
  const refused: RefusedPlanet[] = []
  for (const [id, entry] of Object.entries(lock.planets)) {
    try {
      const pkg = readPlanetFolder(installedFolder(planetsDir, id))
      if (pkg.manifest.id !== id)
        throw new PlanetError('The installed files belong to another Planet.')
      if (pkg.digest !== entry.digest || pkg.manifest.version !== entry.version) {
        throw new PlanetError(
          'The installed files do not match planets.lock (digest mismatch). Reinstall the Planet from a source you trust.',
        )
      }
      if (permissionsDigest(pkg) !== entry.permissions) {
        throw new PlanetError('The permissions differ from what was approved.')
      }
      if (!orbitCompatible(pkg.manifest.orbit, orbitVersion)) {
        throw new PlanetError(`It needs Orbit ${pkg.manifest.orbit}.`)
      }
      planets.push(pkg)
    } catch (error) {
      refused.push({
        id,
        reason: error instanceof Error ? (error.message.split('\n')[0] ?? '') : String(error),
      })
    }
  }
  return { planets, refused }
}
