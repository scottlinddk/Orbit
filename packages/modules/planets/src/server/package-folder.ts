import { createHash } from 'node:crypto'
import { lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { extname, join, relative, sep } from 'node:path'
import { MANIFEST_FILE, PlanetError, parseManifest, type PlanetManifest } from './manifest.ts'

/** A Planet is data. These are the only file types a folder may hold: no scripts, no binaries. */
const ALLOWED_EXTENSIONS = new Set(['.json', '.liquid', '.md', '.txt'])
const MAX_FILES = 100
const MAX_FILE_BYTES = 256 * 1024
const MAX_TOTAL_BYTES = 2 * 1024 * 1024

export interface PlanetFile {
  /** Relative to the Planet folder, with `/` separators. */
  readonly path: string
  readonly content: Buffer
}

export interface PlanetPackage {
  readonly manifest: PlanetManifest
  readonly files: readonly PlanetFile[]
  /** The text of `render.template`. */
  readonly template: string
  /** SHA-256 over every file's path and content. Any edit changes it. */
  readonly digest: string
}

/** Content digest of a set of files, independent of file order and of the folder's location. */
export function digestFiles(files: readonly PlanetFile[]): string {
  const hash = createHash('sha256')
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    hash.update(`${file.path}\0${createHash('sha256').update(file.content).digest('hex')}\n`)
  }
  return `sha256:${hash.digest('hex')}`
}

function collect(root: string): PlanetFile[] {
  const files: PlanetFile[] = []
  let total = 0
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      const path = relative(root, full).split(sep).join('/')
      // lstat, not stat: a symlink could point at /etc/passwd or at the secrets folder.
      const stat = lstatSync(full)
      if (stat.isSymbolicLink())
        throw new PlanetError(`${path} is a symbolic link, which is not allowed.`)
      if (stat.isDirectory()) {
        walk(full)
        continue
      }
      if (!stat.isFile()) throw new PlanetError(`${path} is not a regular file.`)
      if (!ALLOWED_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        throw new PlanetError(
          `${path}: a Planet may only contain .json, .liquid, .md and .txt files. Planets cannot carry code.`,
        )
      }
      if (stat.size > MAX_FILE_BYTES)
        throw new PlanetError(`${path} is larger than ${MAX_FILE_BYTES} bytes.`)
      total += stat.size
      if (files.length + 1 > MAX_FILES || total > MAX_TOTAL_BYTES) {
        throw new PlanetError('The Planet folder has too many or too large files.')
      }
      files.push({ path, content: readFileSync(full) })
    }
  }
  walk(realpathSync(root))
  return files
}

/**
 * Reads and validates a Planet folder: `planet.json`, `templates/*.liquid`, and anything else
 * that is plain data. Throws a `PlanetError` that names the failing file or field.
 */
export function readPlanetFolder(folder: string): PlanetPackage {
  let files: PlanetFile[]
  try {
    files = collect(folder)
  } catch (error) {
    if (error instanceof PlanetError) throw error
    throw new PlanetError(`Could not read the folder "${folder}".`)
  }
  return buildPackage(files)
}

/** Validates files already in memory. Shared by installing and by loading an installed copy. */
export function buildPackage(files: readonly PlanetFile[]): PlanetPackage {
  const manifestFile = files.find((f) => f.path === MANIFEST_FILE)
  if (!manifestFile) throw new PlanetError(`The folder has no ${MANIFEST_FILE}.`)
  const manifest = parseManifest(manifestFile.content.toString('utf8'))
  const templateFile = files.find((f) => f.path === manifest.render.template)
  if (!templateFile) {
    throw new PlanetError('The manifest names a template that is not in the folder.', [
      { path: 'render.template', message: `${manifest.render.template} does not exist` },
    ])
  }
  return {
    manifest,
    files,
    template: templateFile.content.toString('utf8'),
    digest: digestFiles(files),
  }
}
