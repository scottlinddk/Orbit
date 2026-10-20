import {
  createAuth,
  createUseCases,
  type Auth,
  type Clock,
  type IdGenerator,
  type PasswordHasher,
  type Repositories,
  type RegistrationPolicy,
  type SessionTokens,
  type UseCases,
} from '@orbit/application'

export interface Services {
  useCases: UseCases
  auth: Auth
}

export interface ServiceParts {
  repos: Repositories
  hasher: PasswordHasher
  tokens: SessionTokens
  clock: Clock
  ids: IdGenerator
  registrationPolicy: RegistrationPolicy
}

/** Wires the application layer to concrete adapters. The only place that does so. */
export function assembleServices(parts: ServiceParts): Services {
  const { repos, hasher, tokens, clock, ids, registrationPolicy } = parts
  return {
    useCases: createUseCases({
      users: repos.users,
      accounts: repos.accounts,
      households: repos.households,
      dashboards: repos.dashboards,
      ids,
    }),
    auth: createAuth({
      accounts: repos.accounts,
      sessions: repos.sessions,
      hasher,
      tokens,
      clock,
      ids,
      registrationPolicy,
    }),
  }
}
