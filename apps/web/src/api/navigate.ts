/** A full page navigation, in its own module so tests can replace it (jsdom cannot navigate). */
export function goTo(url: string): void {
  window.location.assign(url)
}
