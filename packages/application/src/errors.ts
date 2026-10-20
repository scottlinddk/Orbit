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
