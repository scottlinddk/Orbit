import { z } from 'zod'

const environment = z.object({
  ORBIT_DATABASE_PATH: z.string().min(1).default('./data/orbit.sqlite'),
  ORBIT_HOST: z.string().min(1).default('127.0.0.1'),
  ORBIT_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  /** The address people type into the browser. Decides the cookie flags and the allowed Origin. */
  ORBIT_PUBLIC_URL: z.url({ protocol: /^https?$/ }).default('http://localhost:3000'),
  ORBIT_REGISTRATION: z.enum(['first-user-only', 'open']).default('first-user-only'),
  /** Set to true only behind a reverse proxy you control, so client IPs come from its headers. */
  ORBIT_TRUST_PROXY: z.enum(['true', 'false']).default('false'),
  /** Folder with the built web app (apps/web/dist). When set, the API serves it too. */
  ORBIT_WEB_DIR: z.string().min(1).optional(),
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
  trustProxy: boolean
  webDir: string | undefined
  logLevel: z.infer<typeof environment>['ORBIT_LOG_LEVEL']
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const parsed = environment.safeParse(env)
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
    trustProxy: e.ORBIT_TRUST_PROXY === 'true',
    webDir: e.ORBIT_WEB_DIR,
    logLevel: e.ORBIT_LOG_LEVEL,
  }
}
