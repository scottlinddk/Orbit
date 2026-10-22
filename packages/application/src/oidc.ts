/**
 * Sign-in with an external OpenID Connect provider (ADR 0018). The protocol work (discovery,
 * token exchange, ID token verification) sits behind this port, so the use cases only see who the
 * provider says the person is.
 */
export interface OidcAuthorization {
  /** Where to send the browser. */
  readonly url: string
  /** All three must come back unchanged with the callback. The caller keeps them out of reach of scripts. */
  readonly state: string
  readonly nonce: string
  readonly codeVerifier: string
}

/** What a verified ID token says. Only `issuer` and `subject` identify a person. */
export interface OidcIdentity {
  readonly issuer: string
  readonly subject: string
  /** The provider's `name` or `preferred_username`, used only as a display name for a new user. */
  readonly displayName?: string | undefined
}

export interface OidcProvider {
  /** The text for the sign-in button. */
  readonly label: string
  authorize(): Promise<OidcAuthorization>
  /** Exchanges the code and returns the verified identity. Throws OidcError. */
  exchange(input: { code: string; codeVerifier: string; nonce: string }): Promise<OidcIdentity>
}

export type OidcFailure = 'unavailable' | 'token-exchange' | 'invalid-token' | 'configuration'

/** The provider could not be reached or its answer was not acceptable. The message is safe to log. */
export class OidcError extends Error {
  readonly reason: OidcFailure
  constructor(reason: OidcFailure, message: string) {
    super(message)
    this.name = 'OidcError'
    this.reason = reason
  }
}
