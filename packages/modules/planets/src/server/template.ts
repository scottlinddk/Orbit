import { Liquid } from 'liquidjs'

/** Output past this is refused, so one template cannot fill a dashboard response. */
export const MAX_RENDERED_BYTES = 64 * 1024
const MAX_TEMPLATE_CHARS = 32 * 1024
const RENDER_LIMIT_MS = 200
const MEMORY_LIMIT_BYTES = 16 * 1024 * 1024

export class TemplateError extends Error {
  override readonly name = 'TemplateError'
}

const denied = (what: string) => () => {
  throw new TemplateError(`${what} is not available in Planet templates.`)
}

/** Tags that load other files. Planet templates are single, self-contained strings. */
const FILE_TAGS = ['include', 'render', 'layout', 'block']

/** Templates never touch the filesystem: every file operation fails. */
const noFilesystem = {
  readFile: () => Promise.reject(new TemplateError('Templates cannot read files.')),
  readFileSync: denied('Reading files'),
  exists: () => Promise.resolve(false),
  existsSync: () => false,
  resolve: denied('Reading files'),
  contains: () => Promise.resolve(false),
  dirname: () => '.',
  sep: '/',
}

function createEngine(rawOutput: boolean): Liquid {
  const engine = new Liquid({
    // Every `{{ output }}` is HTML-escaped unless a filter says otherwise.
    outputEscape: 'escape',
    strictFilters: true,
    strictVariables: false,
    // Data comes from the network. Only own properties are readable, never the prototype chain.
    ownPropertyOnly: true,
    parseLimit: MAX_TEMPLATE_CHARS,
    renderLimit: RENDER_LIMIT_MS,
    memoryLimit: MEMORY_LIMIT_BYTES,
    fs: noFilesystem,
    cache: false,
  })
  for (const tag of FILE_TAGS) {
    engine.registerTag(tag, { parse: denied(`{% ${tag} %}`), render: () => '' })
  }
  if (!rawOutput) {
    // Without the permission `raw` keeps its name but no longer skips escaping.
    engine.registerFilter('raw', (value: unknown) => value)
  }
  return engine
}

const engines = { escaped: createEngine(false), raw: createEngine(true) }

/**
 * Renders a Planet template. Output is escaped by default; the `raw` filter works only for a
 * Planet that declared `permissions.raw_output`. Time, memory, template size and output size
 * are limited, and a failure is reported as a `TemplateError` without internals.
 */
export async function renderTemplate(
  source: string,
  context: Record<string, unknown>,
  options: { rawOutput: boolean },
): Promise<string> {
  const engine = options.rawOutput ? engines.raw : engines.escaped
  let html: string
  try {
    html = await engine.parseAndRender(source, context)
  } catch (error) {
    if (error instanceof TemplateError) throw error
    throw new TemplateError(`The template could not be rendered: ${firstLine(error)}`)
  }
  if (Buffer.byteLength(html, 'utf8') > MAX_RENDERED_BYTES) {
    throw new TemplateError('The rendered output is too large.')
  }
  return html
}

const firstLine = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).split('\n')[0]?.slice(0, 200) ?? ''
