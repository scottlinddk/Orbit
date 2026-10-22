/**
 * The resource does not exist or the caller may not know about it. Both cases look identical
 * on purpose, so a response never confirms that another household's resource exists.
 */
export class NotFoundError extends Error {
  constructor() {
    super('Not found')
    this.name = 'NotFoundError'
  }
}

/** The caller belongs to the household but their role does not allow this action. */
export class ForbiddenError extends Error {
  constructor(action: string) {
    super(`Not allowed: ${action}`)
    this.name = 'ForbiddenError'
  }
}

/** A feed has grown past the size a display can take. The owner must pick fewer fields. */
export class FeedTooLargeError extends Error {
  constructor() {
    super('The feed is too large to publish')
    this.name = 'FeedTooLargeError'
  }
}

/** Storing a secret needs the operator's master key, and none is configured. */
export class SecretsNotConfiguredError extends Error {
  constructor() {
    super(
      'Saving a calendar address needs ORBIT_SECRET_KEY (at least 32 characters) in the server settings. Ask whoever runs this server to set one. They can generate it with: openssl rand -base64 32',
    )
    this.name = 'SecretsNotConfiguredError'
  }
}

/** A calendar feed could not be read. The message is safe to show: it never contains the address. */
export class CalendarFeedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CalendarFeedError'
  }
}
