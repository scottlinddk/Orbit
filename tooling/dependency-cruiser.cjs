/**
 * Enforces the dependency rules from docs/architecture/overview.md and ADR 0005.
 * Run with `pnpm check:boundaries`. A violation fails CI.
 */

/** @type {import('dependency-cruiser').IForbiddenRuleType[]} */
const forbidden = [
  {
    name: 'no-circular',
    severity: 'error',
    comment: 'Circular dependencies make the layering meaningless.',
    from: {},
    to: { circular: true },
  },
  {
    name: 'no-unresolvable-imports',
    severity: 'error',
    comment:
      'Imports must resolve. An undeclared workspace dependency is a boundary escape attempt or a bug.',
    from: {},
    to: { couldNotResolve: true },
  },
  {
    name: 'no-undeclared-npm-dependencies',
    severity: 'error',
    comment:
      'Every npm package a workspace package imports must be declared in its own package.json.',
    from: { pathNot: '^tooling/' },
    to: { dependencyTypes: ['npm-no-pkg', 'npm-unknown'] },
  },
  {
    name: 'domain-is-pure',
    severity: 'error',
    comment:
      'packages/domain imports nothing outside itself: no npm packages, no node builtins, no other packages.',
    from: { path: '^packages/domain/src', pathNot: '\\.test\\.ts$' },
    to: { pathNot: '^packages/domain/src' },
  },
  {
    name: 'domain-tests-only-vitest',
    severity: 'error',
    comment: 'Domain tests may use vitest and the domain itself, nothing else.',
    from: { path: '^packages/domain/src/.*\\.test\\.ts$' },
    to: { pathNot: ['^packages/domain/src', 'node_modules/vitest/'] },
  },
  {
    name: 'contracts-only-zod',
    severity: 'error',
    comment: 'packages/contracts may import zod and itself, nothing else.',
    from: { path: '^packages/contracts/src' },
    to: { pathNot: ['^packages/contracts/src', 'node_modules/zod/'] },
  },
  {
    name: 'application-imports-inward-only',
    severity: 'error',
    comment:
      'Use cases and ports depend on domain and contracts only. No vendor SDKs, no adapters.',
    from: { path: '^packages/application/src' },
    to: {
      pathNot: ['^packages/application/src', '^packages/domain/src', '^packages/contracts/src'],
    },
  },
  {
    name: 'adapters-not-outward',
    severity: 'error',
    comment: 'Adapters implement ports. They never import apps, modules or integrations.',
    from: { path: '^packages/adapters/' },
    to: { path: ['^apps/', '^packages/modules/', '^packages/integrations/'] },
  },
  {
    name: 'adapters-isolated-from-each-other',
    severity: 'error',
    comment:
      'Each adapter is replaceable on its own. Wire adapters together in the composition root.',
    from: { path: '^packages/adapters/([^/]+)/' },
    to: { path: '^packages/adapters/', pathNot: '^packages/adapters/$1/' },
  },
  {
    name: 'modules-and-integrations-not-outward',
    severity: 'error',
    comment:
      'Modules and integrations use ports and contracts. They never import apps or adapters.',
    from: { path: '^packages/(modules|integrations)/' },
    to: { path: ['^apps/', '^packages/adapters/'] },
  },
  {
    name: 'modules-isolated-from-each-other',
    severity: 'error',
    comment: 'Modules and integrations must not reach into each other. Share through contracts.',
    from: { path: '^packages/(modules|integrations)/([^/]+)/' },
    to: { path: '^packages/(modules|integrations)/', pathNot: '^packages/$1/$2/' },
  },
  {
    name: 'module-server-and-web-are-separate',
    severity: 'error',
    comment:
      'A module server entry and web entry never import each other, so the SPA bundles no server code.',
    from: { path: '^packages/modules/([^/]+)/src/server/' },
    to: { path: '^packages/modules/$1/src/web/' },
  },
  {
    name: 'module-web-uses-contracts-only',
    severity: 'error',
    comment:
      'Module web code talks to the platform through contracts, not domain, application or adapters.',
    from: { path: '^packages/modules/[^/]+/src/web/' },
    to: {
      path: [
        '^packages/domain/',
        '^packages/application/',
        '^packages/adapters/',
        '^packages/integrations/',
        '^apps/',
      ],
    },
  },
  {
    name: 'module-server-not-to-module-web',
    severity: 'error',
    comment: 'Server entries must not pull in browser code.',
    from: { path: '^packages/modules/[^/]+/src/server/' },
    to: { path: '^packages/modules/[^/]+/src/web/' },
  },
  {
    name: 'widget-sdk-is-a-thin-contract',
    severity: 'error',
    comment:
      'The widget contract imports React types only, so every module can depend on it cheaply.',
    from: { path: '^packages/widget-sdk/src' },
    to: {
      pathNot: ['^packages/widget-sdk/src', 'node_modules/react/', 'node_modules/@types/react/'],
    },
  },
  {
    name: 'web-boundary',
    severity: 'error',
    comment:
      'apps/web imports contracts and module web entries only. Never server code or the API app.',
    from: { path: '^apps/web/src' },
    to: {
      path: [
        '^packages/domain/',
        '^packages/application/',
        '^packages/adapters/',
        '^packages/integrations/',
        '^packages/modules/[^/]+/src/server/',
        '^apps/api/',
      ],
    },
  },
  {
    name: 'api-not-to-web',
    severity: 'error',
    comment: 'The API never imports the SPA.',
    from: { path: '^apps/api/' },
    to: { path: '^apps/web/' },
  },
  {
    name: 'packages-not-to-apps',
    severity: 'error',
    comment: 'Apps compose packages. Packages never import apps.',
    from: { path: '^packages/' },
    to: { path: '^apps/' },
  },
  {
    name: 'no-orphans-outside-entries',
    severity: 'warn',
    comment: 'Unreferenced source files are probably dead code.',
    from: {
      orphan: true,
      // sw.js is read by the web build (vite.config.ts) and served as /sw.js, never imported.
      pathNot: [
        '/index\\.ts$',
        '/main\\.tsx?$',
        '\\.d\\.ts$',
        '\\.config\\.ts$',
        'apps/web/src/pwa/sw\\.js$',
      ],
    },
    to: {},
  },
]

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden,
  options: {
    doNotFollow: { path: 'node_modules' },
    combinedDependencies: true,
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
    exclude: { path: ['/dist/', '/coverage/'] },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
      extensions: ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json'],
    },
  },
}
