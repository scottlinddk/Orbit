/** Thrown when a domain rule is broken. The API layer maps it to a 422 response. */
export class InvariantViolation extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvariantViolation'
  }
}

export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new InvariantViolation(message)
}
