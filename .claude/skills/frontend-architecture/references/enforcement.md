# Enforcing the boundaries with lint

Rules that live only in a document erode. These configs turn `SKILL.md` §9 into lint errors.
Adapt the paths to the project. Each block is independent.

## 1. One-way dependencies: `import/no-restricted-paths`

Requires `eslint-plugin-import` (or `eslint-plugin-import-x`) plus a TypeScript resolver for the
`@/` alias. The pattern comes from Bulletproof React's `project-structure.md`.

```js
// eslint.config.js (flat config) — rules section
'import/no-restricted-paths': ['error', {
  zones: [
    // shared code must not depend on features or routes
    {
      target: ['./src/components', './src/lib', './src/utils', './src/hooks', './src/config', './src/types'],
      from: ['./src/features', './src/app'],
      message: 'Shared code cannot import from features or routes. Move the code down or pass it in.',
    },
    // features must not depend on routes
    { target: './src/features', from: './src/app' },
    // no cross-feature imports (repeat per feature, or generate the list)
    { target: './src/features/agents', from: './src/features', except: ['./agents'] },
    { target: './src/features/reviews', from: './src/features', except: ['./reviews'] },
  ],
}],
```

## 2. Element types: `eslint-plugin-boundaries`

A more expressive alternative: you declare element types by path pattern and allowed
dependencies between them. It also supports rules like "helpers can't import react".

```js
settings: {
  'boundaries/elements': [
    { type: 'app',        pattern: 'src/app/**' },
    { type: 'feature',    pattern: 'src/features/*', capture: ['feature'] },
    { type: 'components', pattern: 'src/components/**' },
    { type: 'lib',        pattern: 'src/lib/**' },
    { type: 'utils',      pattern: 'src/utils/**' },
  ],
},
rules: {
  'boundaries/element-types': ['error', {
    default: 'disallow',
    rules: [
      { from: 'app',        allow: ['feature', 'components', 'lib', 'utils'] },
      { from: 'feature',    allow: ['components', 'lib', 'utils', ['feature', { feature: '${from.feature}' }]] },
      { from: 'components', allow: ['components', 'lib', 'utils'] },
      { from: 'lib',        allow: ['lib', 'utils'] },
      { from: 'utils',      allow: ['utils'] },
    ],
  }],
  // keep utils pure: no React in utils
  'boundaries/external': ['error', {
    default: 'allow',
    rules: [{ from: 'utils', disallow: ['react', 'react-dom', 'next'] }],
  }],
},
```

Check the plugin's current README before copying. Option names have changed between major
versions.

## 3. Barrel policy

```js
// forbid `export *` in app code (narrow public API only)
'no-restricted-syntax': ['error', {
  selector: 'ExportAllDeclaration',
  message: 'Use explicit named re-exports in index.ts (narrow public API). No export *.',
}],

// forbid deep imports into another component's internals
'no-restricted-imports': ['error', {
  patterns: [{
    group: ['@/components/*/_components/*', '@/components/*/helpers', '@/components/*/constants'],
    message: 'Import the component folder through its index.ts. If you need an internal, promote it.',
  }],
}],

// catch the circular imports that barrels tend to create
'import/no-cycle': 'error',
```

Biome users: `noBarrelFile` and `noReExportAll` cover similar ground.

## 4. Server-only code

In Next.js, add `import 'server-only'` at the top of modules that read secrets or a database.
The build then fails if a client component imports them, with no lint config needed.

## 5. Monorepos

Nx's `@nx/enforce-module-boundaries` gives tag-based rules (`type:feature` may depend on
`type:ui`, `type:util`) across packages. Use it instead of the configs above when the codebase
is an Nx workspace.
