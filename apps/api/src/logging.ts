import type { Config } from './config.ts'

/** Cookies and credentials must never reach logs, even if a serializer starts including them. */
export function loggerOptions(level: Config['logLevel']) {
  return {
    level,
    redact: {
      paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
      censor: '[redacted]',
    },
  }
}
