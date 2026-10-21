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
  type SetupGate,
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
  setupGate?: SetupGate | undefined
}

/** Wires the application layer to concrete adapters. The only place that does so. */
export function assembleServices(parts: ServiceParts): Services {
  const { repos, hasher, tokens, clock, ids, registrationPolicy, setupGate } = parts
  return {
    useCases: createUseCases({
      users: repos.users,
      accounts: repos.accounts,
      households: repos.households,
      dashboards: repos.dashboards,
      invitations: repos.invitations,
      tokens,
      clock,
      ids,
    }),
    auth: createAuth({
      accounts: repos.accounts,
      sessions: repos.sessions,
      hasher,
      tokens,
      clock,
      ids,
      invitations: repos.invitations,
      households: repos.households,
      registrationPolicy,
      setupGate,
    }),
  }
}
