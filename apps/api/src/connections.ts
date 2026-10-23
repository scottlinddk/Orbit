import { createGuardedFetcher } from '@orbit/adapter-egress-guard'
import type { IntegrationProvider } from '@orbit/application'
import { createGrocyProvider } from '@orbit/integration-grocy'
import { createHomeAssistantProvider } from '@orbit/integration-home-assistant'
import { createMealieProvider } from '@orbit/integration-mealie'
import type { Config } from './config.ts'

/**
 * The systems an owner can connect. Every request they make goes through the one egress guard,
 * so a system on the household's network is reachable only when the operator listed its host in
 * ORBIT_EGRESS_ALLOW_PRIVATE_HOSTS (ADR 0019).
 */
export function createConnectionWiring(config: Partial<Pick<Config, 'egressAllowPrivateHosts'>>): {
  providers: readonly IntegrationProvider[]
} {
  const fetcher = createGuardedFetcher({
    allowPrivateHosts: config.egressAllowPrivateHosts ?? new Set(),
  })
  return {
    providers: [
      createHomeAssistantProvider(fetcher),
      createMealieProvider(fetcher),
      createGrocyProvider(fetcher),
    ],
  }
}
