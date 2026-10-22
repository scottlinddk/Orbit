import { dirname, join } from 'node:path'
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
  /** Master key for stored secrets (Planet API keys). At least 32 characters: `openssl rand -base64 32`. */
  ORBIT_SECRET_KEY: z.string().min(32).optional(),
  /** Where installed Planets and planets.lock live. Defaults to a folder next to the database. */
  ORBIT_PLANETS_DIR: z.string().min(1).optional(),
  /**
   * Host names (comma separated) that outbound requests may reach even though they resolve to a
   * private address, such as a NAS. Per host, never global. Planets also need the `lan` permission.
   */
  ORBIT_EGRESS_ALLOW_PRIVATE_HOSTS: z.string().optional(),
  /** OpenID Connect sign-in (ADR 0018). Issuer, client id and client secret go together. */
  ORBIT_OIDC_ISSUER: z.url({ protocol: /^https?$/ }).optional(),
  ORBIT_OIDC_CLIENT_ID: z.string().min(1).max(256).optional(),
  ORBIT_OIDC_CLIENT_SECRET: z.string().min(1).max(1024).optional(),
  ORBIT_OIDC_SCOPES: z.string().min(1).max(256).default('openid profile'),
  ORBIT_OIDC_BUTTON_LABEL: z.string().min(1).max(40).default('Single sign-on'),
  /** `disabled` turns password sign-in and sign-up off. Needs OIDC. The orbit command line still works. */
  ORBIT_LOCAL_LOGIN: z.enum(['enabled', 'disabled']).default('enabled'),
  ORBIT_LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
})

export interface OidcConfig {
  /** Exactly as configured. It must equal the `iss` of the ID tokens. */
  issuer: string
  clientId: string
  clientSecret: string
  scopes: string[]
  label: string
  /** The address to register at the provider. */
  redirectUri: string
  /** Endpoints may use http: the issuer is http and its host is on the private-host list. */
  allowHttp: boolean
}

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
  /** Master key for the secret store. Undefined means secrets cannot be stored. */
  secretKey: string | undefined
  planetsDir: string
  /** Lower-case host names an administrator allows to resolve to private addresses. */
  egressAllowPrivateHosts: ReadonlySet<string>
  /** Undefined when no provider is configured. */
  oidc: OidcConfig | undefined
  /** False when ORBIT_LOCAL_LOGIN=disabled. */
  localLogin: boolean
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
    ORBIT_SECRET_KEY: env.ORBIT_SECRET_KEY || undefined,
    ORBIT_PLANETS_DIR: env.ORBIT_PLANETS_DIR || undefined,
    ORBIT_OIDC_ISSUER: env.ORBIT_OIDC_ISSUER || undefined,
    ORBIT_OIDC_CLIENT_ID: env.ORBIT_OIDC_CLIENT_ID || undefined,
    ORBIT_OIDC_CLIENT_SECRET: env.ORBIT_OIDC_CLIENT_SECRET || undefined,
    ORBIT_OIDC_SCOPES: env.ORBIT_OIDC_SCOPES || undefined,
    ORBIT_OIDC_BUTTON_LABEL: env.ORBIT_OIDC_BUTTON_LABEL || undefined,
    ORBIT_LOCAL_LOGIN: env.ORBIT_LOCAL_LOGIN || undefined,
  })
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`)
    throw new ConfigError(`Invalid configuration:\n${lines.join('\n')}`)
  }
  const e = parsed.data
  const url = new URL(e.ORBIT_PUBLIC_URL)
  const privateHosts = new Set(
    (e.ORBIT_EGRESS_ALLOW_PRIVATE_HOSTS ?? '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter((h) => h !== ''),
  )
  const oidc = oidcConfig(e, url, privateHosts)
  if (e.ORBIT_LOCAL_LOGIN === 'disabled' && !oidc) {
    throw new ConfigError(
      'Invalid configuration:\n  ORBIT_LOCAL_LOGIN: cannot be "disabled" without ORBIT_OIDC_ISSUER, or nobody could sign in',
    )
  }
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
    secretKey: e.ORBIT_SECRET_KEY,
    planetsDir: e.ORBIT_PLANETS_DIR ?? join(dirname(e.ORBIT_DATABASE_PATH), 'planets'),
    egressAllowPrivateHosts: privateHosts,
    oidc,
    localLogin: e.ORBIT_LOCAL_LOGIN === 'enabled',
    logLevel: e.ORBIT_LOG_LEVEL,
  }
}

function oidcConfig(
  e: z.infer<typeof environment>,
  publicUrl: URL,
  privateHosts: ReadonlySet<string>,
): OidcConfig | undefined {
  const given = [e.ORBIT_OIDC_ISSUER, e.ORBIT_OIDC_CLIENT_ID, e.ORBIT_OIDC_CLIENT_SECRET]
  if (given.every((v) => v === undefined)) return undefined
  if (given.some((v) => v === undefined)) {
    throw new ConfigError(
      'Invalid configuration:\n  ORBIT_OIDC_ISSUER, ORBIT_OIDC_CLIENT_ID and ORBIT_OIDC_CLIENT_SECRET must all be set, or none of them',
    )
  }
  const issuer = e.ORBIT_OIDC_ISSUER!
  const issuerUrl = new URL(issuer)
  const allowHttp = issuerUrl.protocol === 'http:'
  if (allowHttp && !privateHosts.has(issuerUrl.hostname.toLowerCase())) {
    throw new ConfigError(
      `Invalid configuration:\n  ORBIT_OIDC_ISSUER: must be https, or http with its host listed in ORBIT_EGRESS_ALLOW_PRIVATE_HOSTS (${issuerUrl.hostname})`,
    )
  }
  // `openid` is what makes it OpenID Connect at all, so it is always asked for.
  const scopes = [...new Set(['openid', ...e.ORBIT_OIDC_SCOPES.split(/\s+/).filter((v) => v)])]
  return {
    issuer,
    clientId: e.ORBIT_OIDC_CLIENT_ID!,
    clientSecret: e.ORBIT_OIDC_CLIENT_SECRET!,
    scopes,
    label: e.ORBIT_OIDC_BUTTON_LABEL,
    redirectUri: `${publicUrl.origin}/api/v1/auth/oidc/callback`,
    allowHttp,
  }
}
