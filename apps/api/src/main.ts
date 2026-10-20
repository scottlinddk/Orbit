import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { migrate, openDatabase } from '@orbit/adapter-persistence-sqlite'
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
  const applied = migrate(db)

  const services = createSqliteServices(db, config)
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
}

main().catch((error) => {
  if (error instanceof ConfigError) console.error(error.message)
  else console.error(error)
  process.exit(1)
})
