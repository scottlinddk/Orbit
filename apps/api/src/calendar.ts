import { createGuardedFetcher } from '@orbit/adapter-egress-guard'
import type { Database } from '@orbit/adapter-persistence-sqlite'
import { EncryptedDbSecretStore } from '@orbit/adapter-secrets-encrypted-db'
import {
  CalendarFeedError,
  EgressDeniedError,
  SecretsNotConfiguredError,
  type CalendarFeedReader,
  type EgressFetcher,
  type SecretStore,
} from '@orbit/application'
import {
  fetchIcsEvents,
  IcsFetchError,
  IcsParseError,
  parseFeedAddress,
} from '@orbit/integration-ics-calendar'
import type { Config } from './config.ts'
import { MissingKeySecretStore } from './secrets.ts'

/**
 * Reads household calendars through the ICS integration and the one egress guard. Feed
 * addresses are credentials, so every failure is turned into a message that names neither the
 * address nor where it resolved to.
 */
export function createIcsFeedReader(fetcher: EgressFetcher): CalendarFeedReader {
  return {
    parseAddress: parseFeedAddress,
    async read(url, range) {
      try {
        return await fetchIcsEvents(fetcher, url, range)
      } catch (error) {
        if (
          error instanceof IcsFetchError ||
          error instanceof IcsParseError ||
          error instanceof EgressDeniedError
        )
          throw new CalendarFeedError(error.message)
        throw error
      }
    },
  }
}

export interface CalendarWiring {
  readonly secrets: SecretStore
  readonly reader: CalendarFeedReader
}

/** The production parts the calendar service needs. Without a secret key nothing can be saved. */
export function createCalendarWiring(
  db: Database,
  config: Partial<Pick<Config, 'secretKey' | 'egressAllowPrivateHosts'>>,
): CalendarWiring {
  return {
    secrets: config.secretKey
      ? new EncryptedDbSecretStore(db, config.secretKey)
      : new MissingKeySecretStore(() => new SecretsNotConfiguredError()),
    reader: createIcsFeedReader(
      createGuardedFetcher({ allowPrivateHosts: config.egressAllowPrivateHosts ?? new Set() }),
    ),
  }
}
