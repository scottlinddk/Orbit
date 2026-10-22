import { readFileSync } from 'node:fs'
import { createGuardedFetcher } from '@orbit/adapter-egress-guard'
import { SqliteJobScheduler } from '@orbit/adapter-jobs-sqlite'
import type { Database } from '@orbit/adapter-persistence-sqlite'
import { SqlitePlanetStateStore } from '@orbit/adapter-planets-sqlite'
import { EncryptedDbSecretStore } from '@orbit/adapter-secrets-encrypted-db'
import type { EgressFetcher } from '@orbit/application'
import {
  fetchIcsEvents,
  IcsFetchError,
  IcsParseError,
  type IcsEgressOptions,
} from '@orbit/integration-ics-calendar'
import type { CalendarEvent } from '@orbit/domain'
import {
  loadInstalledPlanets,
  PlanetError,
  PlanetRuntime,
  SourceError,
  type IcalReader,
  type RefusedPlanet,
} from '@orbit/module-planets/server'
import type { Config } from './config.ts'
import { MissingKeySecretStore } from './secrets.ts'

/** The version Planets' `orbit` range is checked against: the one in apps/api/package.json. */
export function orbitVersion(): string {
  const text = readFileSync(new URL('../package.json', import.meta.url), 'utf8')
  return (JSON.parse(text) as { version: string }).version
}

const mapEvent = (event: CalendarEvent) =>
  event.kind === 'all-day'
    ? {
        id: event.id,
        title: event.title,
        allDay: true,
        startDate: event.startDate,
        endDate: event.endDate,
        ...(event.location === undefined ? {} : { location: event.location }),
      }
    : {
        id: event.id,
        title: event.title,
        allDay: false,
        start: event.start,
        end: event.end,
        ...(event.location === undefined ? {} : { location: event.location }),
      }

/** Planets read ICS through the one ICS integration and the one egress guard. */
export function createIcalReader(fetcher: EgressFetcher): IcalReader {
  return async (request) => {
    const egress: IcsEgressOptions = {
      allowedHosts: request.allowedHosts,
      allowPrivate: request.allowPrivate,
      headers: request.headers,
    }
    try {
      const events = await fetchIcsEvents(
        fetcher,
        request.url,
        { from: request.from, to: request.to },
        egress,
      )
      return events.slice(0, request.maxEvents).map(mapEvent)
    } catch (error) {
      // These messages are written for users. Egress denials pass through as they are.
      if (error instanceof IcsFetchError || error instanceof IcsParseError) {
        throw new SourceError(error.message)
      }
      throw error
    }
  }
}

export interface PlanetWiring {
  readonly runtime: PlanetRuntime
  readonly refused: readonly RefusedPlanet[]
  /** Set when planets.lock could not be read at all. */
  readonly lockProblem?: string
}

/**
 * Loads the installed Planets that still match planets.lock and builds the runtime from the
 * production adapters. A Planet that no longer matches is refused and reported, never loaded.
 */
export function createPlanetWiring(
  db: Database,
  config: Pick<Config, 'planetsDir' | 'secretKey' | 'egressAllowPrivateHosts'>,
): PlanetWiring {
  let loaded: ReturnType<typeof loadInstalledPlanets> = { planets: [], refused: [] }
  let lockProblem: string | undefined
  try {
    loaded = loadInstalledPlanets(config.planetsDir, orbitVersion())
  } catch (error) {
    lockProblem = error instanceof Error ? error.message : String(error)
  }
  const fetcher = createGuardedFetcher({ allowPrivateHosts: config.egressAllowPrivateHosts })
  const runtime = new PlanetRuntime({
    planets: loaded.planets,
    state: new SqlitePlanetStateStore(db),
    scheduler: new SqliteJobScheduler(db),
    secrets: config.secretKey
      ? new EncryptedDbSecretStore(db, config.secretKey)
      : new MissingKeySecretStore(
          () =>
            new PlanetError(
              'Storing secrets needs ORBIT_SECRET_KEY (at least 32 characters). Generate one with: openssl rand -base64 32',
            ),
        ),
    clock: { now: () => new Date() },
    fetcher,
    readIcal: createIcalReader(fetcher),
  })
  return { runtime, refused: loaded.refused, ...(lockProblem ? { lockProblem } : {}) }
}
