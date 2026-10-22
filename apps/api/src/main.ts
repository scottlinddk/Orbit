import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { OneTimeSetupGate } from '@orbit/adapter-identity-local'
import {
  hasAccounts,
  migrate,
  openDatabase,
  runScheduledBackupIfDue,
  snapshotBeforeMigration,
} from '@orbit/adapter-persistence-sqlite'
import { buildApp } from './app.ts'
import { createSqliteServices } from './composition.ts'
import { ConfigError, loadConfig } from './config.ts'
import { loggerOptions } from './logging.ts'
import { createOidcWiring } from './oidc.ts'
import { createPlanetWiring } from './planets.ts'

const HOUR = 60 * 60 * 1000
const PLANET_TICK_MS = 30 * 1000
const NOTIFICATION_TICK_MS = 30 * 1000

async function main() {
  const config = loadConfig(process.env)

  if (config.databasePath !== ':memory:')
    mkdirSync(dirname(config.databasePath), { recursive: true })
  const db = openDatabase(config.databasePath)
  if (config.databasePath !== ':memory:') {
    // Upgrades are forward-only. If the snapshot fails, stop before the schema changes.
    const directory = join(dirname(config.databasePath), 'backups')
    const snapshot = await snapshotBeforeMigration(db, {
      directory,
      keep: config.migrationSnapshots,
    }).catch((error: unknown) => {
      throw new ConfigError(
        `Could not write the snapshot before the database upgrade to ${directory}: ${error instanceof Error ? error.message : error}\n` +
          'Nothing was changed. Free disk space or fix the folder, then start again.',
      )
    })
    if (snapshot)
      console.info(JSON.stringify({ level: 'info', snapshot, msg: 'wrote pre-migration snapshot' }))
  }
  const applied = migrate(db)

  // A new instance that anyone can reach must not hand its owner role to the first visitor.
  const setup =
    config.registration === 'first-user-only' && !hasAccounts(db)
      ? config.setupCode
        ? { gate: OneTimeSetupGate.fromCode(config.setupCode), code: undefined }
        : OneTimeSetupGate.generate()
      : undefined

  const planets = createPlanetWiring(db, config)
  const services = createSqliteServices(
    db,
    config,
    setup?.gate,
    planets.runtime,
    createOidcWiring(config),
  )
  const app = await buildApp({ services, config, logger: loggerOptions(config.logLevel) })
  if (applied.length > 0) app.log.info({ applied }, 'applied database migrations')
  app.log.info({ webApp: config.webDir ?? 'not served' }, 'configuration loaded')
  if (config.oidc) {
    app.log.info(
      { issuer: config.oidc.issuer, redirectUri: config.oidc.redirectUri },
      'OpenID Connect sign-in is on. Register the redirect URI at the provider.',
    )
  }
  for (const refused of planets.refused)
    app.log.error({ planet: refused.id }, `Planet not loaded: ${refused.reason}`)
  if (planets.lockProblem) app.log.error(`No Planets loaded: ${planets.lockProblem}`)

  const purge = setInterval(() => {
    services.auth
      .purgeExpiredSessions()
      .catch((error) => app.log.error({ err: error }, 'session purge failed'))
  }, HOUR)
  purge.unref()

  // Due Planet refreshes. A separate timer from the purge above, whose interval stays as it is.
  const planetTick = setInterval(() => {
    planets.runtime.tick().catch((error) => app.log.error({ err: error }, 'planet refresh failed'))
  }, PLANET_TICK_MS)
  planetTick.unref()

  // Calendar reminders and queued webhook deliveries (ADR 0020).
  const notificationTick = setInterval(() => {
    services.notifications
      .tick()
      .catch((error) => app.log.error({ err: error }, 'notification delivery failed'))
  }, NOTIFICATION_TICK_MS)
  notificationTick.unref()

  // Backups go next to the database, so they do not protect against losing the volume. The
  // operations guide says to copy them off the machine. The hourly check is shorter than the
  // interval on purpose: it looks at the files, so a restart or a night off still gets its backup.
  const backups =
    config.databasePath !== ':memory:' && config.backupIntervalMs > 0
      ? setInterval(() => void runBackup(), HOUR)
      : undefined
  backups?.unref()
  async function runBackup() {
    try {
      const file = await runScheduledBackupIfDue(db, {
        directory: join(dirname(config.databasePath), 'backups'),
        keep: config.backupKeep,
        intervalMs: config.backupIntervalMs,
      })
      if (file) app.log.info({ backup: file }, 'wrote scheduled backup')
    } catch (error) {
      app.log.error({ err: error }, 'scheduled backup failed')
    }
  }

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down')
    clearInterval(purge)
    clearInterval(planetTick)
    clearInterval(notificationTick)
    if (backups) clearInterval(backups)
    await app.close()
    db.close()
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))

  await app.listen({ host: config.host, port: config.port })
  if (backups) void runBackup()
  // Plain text on purpose: it must be easy to find in `docker compose logs`, whatever the log level.
  if (setup?.code)
    console.warn(
      `\nOrbit setup code: ${setup.code}\nEnter it when you create the first account. It is shown once per start and is not stored.\n`,
    )
  else if (setup)
    console.warn('\nOrbit is waiting for its first account. Use your ORBIT_SETUP_CODE.\n')
}

main().catch((error) => {
  if (error instanceof ConfigError) console.error(error.message)
  else console.error(error)
  process.exit(1)
})
