import { z } from 'zod'

const environment = z.object({
  ORBIT_DATABASE_PATH: z.string().min(1).default('./data/orbit.sqlite'),
  ORBIT_HOST: z.string().min(1).default('127.0.0.1'),
  ORBIT_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  /** The address people type into the browser. Decides the cookie flags and the allowed Origin. */
  ORBIT_PUBLIC_URL: z.url({ protocol: /^https?$/ }).default('http://localhost:3000'),
  /** Your own setup code for the first registration, instead of one printed in the log. */
  ORBIT_SETUP_CODE: z.string().min(12).max(64).optional(),
  ORBIT_REGISTRATION: z.enum(['first-user-only', 'open']).default('first-user-only'),
  /** Set to true only behind a reverse proxy you control, so client IPs come from its headers. */
  ORBIT_TRUST_PROXY: z.enum(['true', 'false']).default('false'),
  /** Folder with the built web app (apps/web/dist). When set, the API serves it too. */
  ORBIT_WEB_DIR: z.string().min(1).optional(),
  /** How many snapshots taken before a schema upgrade to keep in the data folder. */
  ORBIT_MIGRATION_SNAPSHOTS: z.coerce.number().int().min(1).max(100).default(5),
  /** Hours between automatic backups in the data folder. 0 turns them off. */
  ORBIT_BACKUP_INTERVAL_HOURS: z.coerce.number().int().min(0).max(720).default(24),
  /** How many automatic backups to keep. */
  ORBIT_BACKUP_KEEP: z.coerce.number().int().min(1).max(365).default(14),
  ORBIT_LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
})

export interface Config {
  databasePath: string
  host: string
  port: number
  /** Scheme, host and port of the public URL, exactly as browsers send it in the Origin header. */
  origin: string
  secureCookies: boolean
  registration: 'first-user-only' | 'open'
  setupCode: string | undefined
  trustProxy: boolean
  webDir: string | undefined
  migrationSnapshots: number
  /** Milliseconds between automatic backups. 0 means off. */
  backupIntervalMs: number
  backupKeep: number
  logLevel: z.infer<typeof environment>['ORBIT_LOG_LEVEL']
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  // Compose passes unset optional variables as empty strings.
  const parsed = environment.safeParse({
    ...env,
    ORBIT_SETUP_CODE: env.ORBIT_SETUP_CODE || undefined,
  })
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`)
    throw new ConfigError(`Invalid configuration:\n${lines.join('\n')}`)
  }
  const e = parsed.data
  const url = new URL(e.ORBIT_PUBLIC_URL)
  return {
    databasePath: e.ORBIT_DATABASE_PATH,
    host: e.ORBIT_HOST,
    port: e.ORBIT_PORT,
    origin: url.origin,
    secureCookies: url.protocol === 'https:',
    registration: e.ORBIT_REGISTRATION,
    setupCode: e.ORBIT_SETUP_CODE,
    trustProxy: e.ORBIT_TRUST_PROXY === 'true',
    webDir: e.ORBIT_WEB_DIR,
    migrationSnapshots: e.ORBIT_MIGRATION_SNAPSHOTS,
    backupIntervalMs: e.ORBIT_BACKUP_INTERVAL_HOURS * 60 * 60 * 1000,
    backupKeep: e.ORBIT_BACKUP_KEEP,
    logLevel: e.ORBIT_LOG_LEVEL,
  }
}
