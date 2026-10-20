import fastifyStatic from '@fastify/static'
import type { FastifyInstance } from 'fastify'

/**
 * The browser app's policy. It can only load its own scripts, styles and images, only talk
 * to its own origin, and cannot be framed. Inline styles set from JavaScript (the grid's
 * CSS variables) are allowed by CSP, because they do not use the style attribute in markup.
 */
export const WEB_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

/** Responses for the API: no content at all is meant to render, so the policy is empty. */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'"

/** Vite fingerprints everything under /assets/, so those files can be cached forever. */
export const isFingerprinted = (url: string) => url.startsWith('/assets/')

/**
 * Serves the built web app from `root` on the same origin as the API. The same origin is what
 * keeps the session cookie SameSite=Strict and the Origin check trivially correct.
 */
export async function registerWebApp(app: FastifyInstance, root: string) {
  await app.register(fastifyStatic, {
    root,
    index: ['index.html'],
    // 'ignore' answers as if the file did not exist (404), so nothing confirms it is there.
    dotfiles: 'ignore',
    // Cache headers are decided in one place (see registerSecurity), not here.
    cacheControl: false,
    etag: true,
  })
}
