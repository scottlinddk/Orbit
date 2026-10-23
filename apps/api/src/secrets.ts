import type { SecretStore } from '@orbit/application'

/**
 * Stands in for the encrypted secret store when the operator has not set a master key. It
 * refuses to store anything, with an error the caller chooses so each feature can explain it in
 * its own words. Reading finds nothing, because nothing could ever have been stored.
 */
export class MissingKeySecretStore implements SecretStore {
  readonly #error: () => Error

  constructor(error: () => Error) {
    this.#error = error
  }

  async set(): Promise<void> {
    throw this.#error()
  }
  async get(): Promise<string | undefined> {
    return undefined
  }
  async names(): Promise<string[]> {
    return []
  }
  async deleteScope(): Promise<void> {}
}
