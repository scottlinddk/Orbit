import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { migrate, openDatabase, SqliteDashboardRepository } from '@orbit/adapter-persistence-sqlite'
import { NotFoundError } from '@orbit/application'
import {
  installPlanet,
  loadInstalledPlanets,
  PlanetError,
  readLockfile,
  uninstallPlanetFiles,
  type InstallPrompt,
} from '@orbit/module-planets/server'
import type { Config } from './config.ts'
import { createPlanetWiring, orbitVersion } from './planets.ts'

export const PLANET_USAGE = `Planets (declarative plugins, installed from a folder on this server):

  planet list                              Installed Planets, their digests and secrets.
  planet install <folder> [--yes]          Show the permissions, ask, then install or update.
  planet uninstall <id>                    Remove the files, stored data, secrets and jobs.
  planet secret set <id> <name>            Store a secret the Planet declared. Reads the value
                                           from the terminal (hidden) or from standard input.
  planet webhook <id> <widget-id> <source> Make a webhook URL for a source. Shown once.

Restart Orbit after installing or removing a Planet so it is loaded.`

/** What the Planet commands need from the terminal. The operator CLI's `CliIo` satisfies it. */
export interface PlanetCliIo {
  out(line: string): void
  err(line: string): void
  /** Reads a secret without echoing it. */
  readSecret?(): Promise<string>
  /** Asks a yes or no question. Without it, installing needs `--yes`. */
  confirm?(question: string): Promise<boolean>
}

const EXIT_OK = 0
const EXIT_FAILED = 1
const EXIT_USAGE = 2

export async function runPlanetCommand(
  args: string[],
  config: Config,
  io: PlanetCliIo,
): Promise<number> {
  const [sub, ...rest] = args
  try {
    switch (sub) {
      case 'list':
        return rest.length === 0 ? list(config, io) : usage(io)
      case 'install': {
        const yes = rest.includes('--yes')
        const folders = rest.filter((a) => a !== '--yes')
        return folders.length === 1 && folders[0]
          ? await install(folders[0], yes, config, io)
          : usage(io)
      }
      case 'uninstall':
        return rest.length === 1 && rest[0] ? await uninstall(rest[0], config, io) : usage(io)
      case 'secret':
        return rest.length === 3 && rest[0] === 'set' && rest[1] && rest[2]
          ? await setSecret(rest[1], rest[2], config, io)
          : usage(io)
      case 'webhook':
        return rest.length === 3 && rest[0] && rest[1] && rest[2]
          ? await webhook(rest[0], rest[1], rest[2], config, io)
          : usage(io)
      default:
        return usage(io)
    }
  } catch (error) {
    if (error instanceof NotFoundError) {
      io.err('No such Planet or webhook source. Check the id, and restart Orbit after installing.')
    } else {
      io.err(error instanceof PlanetError ? error.message : `Failed: ${errorText(error)}`)
    }
    return EXIT_FAILED
  }
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

function usage(io: PlanetCliIo): number {
  io.err(PLANET_USAGE)
  return EXIT_USAGE
}

/** Opens the database for a command that needs stored data. Creates the tables if Orbit never ran. */
function withDatabase<T>(
  config: Config,
  work: (db: ReturnType<typeof openDatabase>) => Promise<T>,
) {
  if (!existsSync(config.databasePath)) {
    throw new PlanetError(`No database at ${config.databasePath}. Check ORBIT_DATABASE_PATH.`)
  }
  const db = openDatabase(config.databasePath)
  migrate(db)
  return work(db).finally(() => db.close())
}

function list(config: Config, io: PlanetCliIo): number {
  const lock = readLockfile(config.planetsDir)
  const { refused } = loadInstalledPlanets(config.planetsDir, orbitVersion())
  const problems = new Map(refused.map((r) => [r.id, r.reason]))
  const ids = Object.keys(lock.planets)
  if (ids.length === 0) io.out('No Planets are installed.')
  for (const id of ids) {
    const entry = lock.planets[id]
    if (!entry) continue
    io.out(`${id} ${entry.version}  ${entry.digest.slice(0, 19)}...`)
    const problem = problems.get(id)
    if (problem) io.out(`  NOT LOADED: ${problem}`)
  }
  return refused.length === 0 ? EXIT_OK : EXIT_FAILED
}

async function install(folder: string, yes: boolean, config: Config, io: PlanetCliIo) {
  const result = await installPlanet({
    sourceDir: resolve(folder),
    planetsDir: config.planetsDir,
    orbitVersion: orbitVersion(),
    now: new Date(),
    approve: async (prompt: InstallPrompt) => {
      io.out(
        `${prompt.name} (${prompt.id}) ${prompt.version}` +
          (prompt.replaces ? `, replacing ${prompt.replaces}` : ''),
      )
      if (prompt.replaces && prompt.permissionsChanged)
        io.out('Its permissions CHANGED. Review them:')
      else io.out('This Planet asks for these permissions. Anything not listed is denied:')
      for (const line of prompt.permissions) io.out(`  - ${line}`)
      if (yes) return true
      if (!io.confirm) {
        io.err('Run again with --yes to approve these permissions.')
        return false
      }
      return io.confirm('Install with these permissions? [y/N] ')
    },
  })
  io.out(
    `${result.replaced ? 'Updated' : 'Installed'} ${result.id} ${result.version} (${result.digest.slice(0, 19)}...). Restart Orbit to load it.`,
  )
  return EXIT_OK
}

async function uninstall(id: string, config: Config, io: PlanetCliIo) {
  const known = uninstallPlanetFiles(config.planetsDir, id)
  const widgets = await withDatabase(config, async (db) => {
    await createPlanetWiring(db, config).runtime.removeData(id)
    return new SqliteDashboardRepository(db).removeWidgetsOfType(`planet.${id}`)
  })
  const placed = widgets === 1 ? '1 dashboard widget' : `${widgets} dashboard widgets`
  io.out(
    known
      ? `Removed ${id}, its stored data, secrets, scheduled jobs and ${placed}. Restart Orbit to unload it.`
      : `${id} was not installed. Any leftover data and ${placed} were removed.`,
  )
  return EXIT_OK
}

async function setSecret(id: string, name: string, config: Config, io: PlanetCliIo) {
  if (!config.secretKey) {
    throw new PlanetError(
      'Set ORBIT_SECRET_KEY (at least 32 characters) first. Generate one with: openssl rand -base64 32',
    )
  }
  const value = (
    await (io.readSecret?.() ?? Promise.reject(new PlanetError('No way to read the secret.')))
  ).trim()
  await withDatabase(config, async (db) => {
    await createPlanetWiring(db, config).runtime.setSecret(id, name, value)
  })
  io.out(`Saved the secret "${name}" for ${id}. It cannot be shown again.`)
  return EXIT_OK
}

async function webhook(
  id: string,
  placementId: string,
  sourceId: string,
  config: Config,
  io: PlanetCliIo,
) {
  const token = await withDatabase(config, (db) =>
    createPlanetWiring(db, config).runtime.createWebhookToken({
      planetId: id,
      placementId,
      sourceId,
    }),
  )
  io.out(`${config.origin}/api/v1/planet-hooks/${token}`)
  io.out('Shown once: Orbit keeps only a hash. Running this again replaces the URL.')
  return EXIT_OK
}
