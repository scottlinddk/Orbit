import { createGuardedFetcher } from '@orbit/adapter-egress-guard'
import { createOidcProvider } from '@orbit/adapter-oidc'
import type { OidcProvider } from '@orbit/application'
import type { Config } from './config.ts'

/**
 * The OpenID Connect provider from the configuration, or undefined when none is set. Discovery,
 * keys and the token request all go through the egress guard, so a provider on the LAN works only
 * when its host is in ORBIT_EGRESS_ALLOW_PRIVATE_HOSTS.
 */
export function createOidcWiring(
  config: Pick<Config, 'oidc' | 'egressAllowPrivateHosts'>,
): OidcProvider | undefined {
  if (!config.oidc) return undefined
  const fetcher = createGuardedFetcher({ allowPrivateHosts: config.egressAllowPrivateHosts })
  return createOidcProvider(config.oidc, fetcher)
}
