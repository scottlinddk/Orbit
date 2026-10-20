import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { defineConfig, type Plugin } from 'vite'

const require = createRequire(import.meta.url)
const FONT_PACKAGE = /^@fontsource(-variable)?\//

/**
 * The SIL Open Font License asks that its text and each font's copyright line come with the
 * fonts. Vite copies only the font files, so this writes them to `licenses/fonts.txt`, next to
 * the app, in every build. The Docker image serves that folder as is.
 */
function fontLicenses(): Plugin {
  return {
    name: 'orbit:font-licenses',
    apply: 'build',
    generateBundle() {
      const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
        dependencies: Record<string, string>
      }
      const sections = Object.keys(pkg.dependencies)
        .filter((name) => FONT_PACKAGE.test(name))
        .sort()
        .map(
          (name) =>
            `=== ${name} ===\n\n${readFileSync(require.resolve(`${name}/LICENSE`), 'utf8').trim()}`,
        )
      this.emitFile({
        type: 'asset',
        fileName: 'licenses/fonts.txt',
        source: `Fonts bundled with Orbit and their licenses.\n\n${sections.join('\n\n\n')}\n`,
      })
    },
  }
}

// In development the SPA runs on :5173 and forwards /api to the API on :3000.
// The API only accepts writes whose Origin equals ORBIT_PUBLIC_URL, so start it with
// ORBIT_PUBLIC_URL=http://localhost:5173 (see apps/web/README.md).
export default defineConfig({
  plugins: [react(), fontLicenses()],
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:3000' } },
  build: { outDir: 'dist' },
})
