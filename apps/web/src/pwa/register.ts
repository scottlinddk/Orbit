/**
 * Registers the service worker in production builds. Browsers allow it only on HTTPS or
 * localhost, so a plain-HTTP LAN install simply stays a normal website. Failure is silent:
 * the app works without the worker.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined)
  })
}
