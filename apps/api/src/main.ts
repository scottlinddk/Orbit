import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { OneTimeSetupGate } from '@orbit/adapter-identity-local'
import {
  hasAccounts,
  migrate,
  openDatabase,
  snapshotBeforeMigration,
} from '@orbit/adapter-persistence-sqlite'
import { buildApp } from './app.ts'
import { createSqliteServices } from './composition.ts'
import { ConfigError, loadConfig } from './config.ts'
import { loggerOptions } from './logging.ts'

const HOUR = 60 * 60 * 1000

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

  const services = createSqliteServices(db, config, setup?.gate)
  const app = await buildApp({ services, config, logger: loggerOptions(config.logLevel) })
  if (applied.length > 0) app.log.info({ applied }, 'applied database migrations')
  app.log.info({ webApp: config.webDir ?? 'not served' }, 'configuration loaded')

  const purge = setInterval(() => {
    services.auth
      .purgeExpiredSessions()
      .catch((error) => app.log.error({ err: error }, 'session purge failed'))
  }, HOUR)
  purge.unref()

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down')
    clearInterval(purge)
    await app.close()
    db.close()
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))

  await app.listen({ host: config.host, port: config.port })
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
