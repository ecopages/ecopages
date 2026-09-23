# Changelog

## 0.2.0-rc.9

### Patch Changes

- [#317](https://github.com/ecopages/ecopages/pull/317) [`5a58517`](https://github.com/ecopages/ecopages/commit/5a58517de1f896240bb54858e12af9b872a76bb2) Thanks [@andeeplus](https://github.com/andeeplus)! - Register `ssr: true` custom-element scripts on Node through the page server-module loader. The dev asset pipeline still points at TypeScript source, so the previous Node preload never ran and hosts rendered as empty tags.
- Updated dependencies [[`5a58517`](https://github.com/ecopages/ecopages/commit/5a58517de1f896240bb54858e12af9b872a76bb2)]:
    - @ecopages/core@0.2.0-rc.9
    - @ecopages/mdx@0.2.0-rc.9

## 0.2.0-rc.8

### Minor Changes

- [#310](https://github.com/ecopages/ecopages/pull/310) [`e31f76b`](https://github.com/ecopages/ecopages/commit/e31f76b552abdd349c3ae7d94ffe20bb4384456a) Thanks [@andeeplus](https://github.com/andeeplus)! - # `ssr: true` in `dependencies.scripts` registers custom elements on the server

    ### Summary

    Ecopages JSX preloads `dependencies.scripts` entries with `ssr: true` before SSR on Bun so Radiant (and other registered) custom-element modules run without a duplicate static import in the component file. On Node, registration scripts are evaluated through the normal asset pipeline during render instead of the isolated app-module preload path. Lit preloads lazy `{ src, ssr: true }` entries only so eager scripts are not registered from an isolated graph that would break `@lit-labs/ssr`. Both integrations share `CustomElementScriptPreloader` from `@ecopages/core`.

    Radiant host serialization continues to load through `@ecopages/radiant/server/radiant-element-ssr`.

    ### Migration checklist (LLM / human)
    - [ ] Remove value imports used only for SSR registration: `import './foo.script.ts';`
    - [ ] Keep type-only imports when needed: `import type { FooProps } from './foo.script.ts';`
    - [ ] Add `ssr: true` on the script entry: `{ src: './foo.script.ts', ssr: true }`
    - [ ] Keep `lazy` for browser timing only; server import still runs when `ssr: true` is set
    - [ ] Do **not** add `ssr: true` to browser-only scripts (unguarded `window` / `document`)
    - [ ] String form `scripts: ['./foo.script.ts']` remains browser-only (no server import)

    ### Before

    ```tsx
    import './theme-toggle.script.ts';

    export const ThemeToggle = eco.component({
    	dependencies: {
    		scripts: [{ src: './theme-toggle.script.ts', lazy: { 'on:idle': true } }],
    	},
    	render: () => <theme-toggle />,
    });
    ```

    ### After

    ```tsx
    export const ThemeToggle = eco.component({
    	dependencies: {
    		scripts: [{ src: './theme-toggle.script.ts', ssr: true, lazy: { 'on:idle': true } }],
    	},
    	render: () => <theme-toggle />,
    });
    ```

    ### If SSR host markup is empty
    - Missing `ssr: true` on the registration script, or
    - Script failed to register (check server logs / `ECOPAGES_DEBUG`), or
    - `radiant: false` on the JSX plugin

### Patch Changes

- Updated dependencies [[`e31f76b`](https://github.com/ecopages/ecopages/commit/e31f76b552abdd349c3ae7d94ffe20bb4384456a)]:
    - @ecopages/core@0.2.0-rc.8
    - @ecopages/mdx@0.2.0-rc.8

## 0.2.0-rc.7

### Patch Changes

- [#291](https://github.com/ecopages/ecopages/pull/291) [`f167916`](https://github.com/ecopages/ecopages/commit/f167916f5159e4ecf421db3d8b199089d6bf6171) Thanks [@andeeplus](https://github.com/andeeplus)! - Fix catch-all request matching so the most specific discovered Page wins, root browser runtime package resolution at the application directory while honoring ESM import conditions, and preserve route-resolved dependency roots through every document-shell renderer.
- Updated dependencies [[`2fa58cb`](https://github.com/ecopages/ecopages/commit/2fa58cb2e12115aa26e2a4bf3d8ea9132f029657), [`f167916`](https://github.com/ecopages/ecopages/commit/f167916f5159e4ecf421db3d8b199089d6bf6171)]:
    - @ecopages/core@0.2.0-rc.7
    - @ecopages/mdx@0.2.0-rc.7

## 0.2.0-rc.6

### Patch Changes

- Updated dependencies [[`e1ba6d9`](https://github.com/ecopages/ecopages/commit/e1ba6d9f00323a618c61dbc6e1ca46da24cdf134)]:
    - @ecopages/core@0.2.0-rc.6
    - @ecopages/mdx@0.2.0-rc.6

## 0.2.0-rc.5

### Patch Changes

- Updated dependencies [[`033ac3d`](https://github.com/ecopages/ecopages/commit/033ac3d35b89136d390fa167313ce234bf864d5d)]:
    - @ecopages/mdx@0.2.0-rc.5
    - @ecopages/core@0.2.0-rc.5

All notable changes to `@ecopages/ecopages-jsx` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED]: TBD

### Features

- Added the Ecopages JSX integration with optional Radiant runtime support and optional MDX routes compiled against `@ecopages/jsx`.
- Added the `@ecopages/ecopages-jsx/eco-embed` helper for Ecopages-JSX-owned mixed-integration authoring on top of `eco.embed()`.

### Breaking Changes

- Removed the shared JSX runtime bundle and browser import-map asset in favor of per-script browser entries that prepend `@ecopages/radiant/client/install-hydrator` when Radiant SSR is enabled.
- Intrinsic custom-element loading now follows explicit `dependencies.scripts` ownership instead of implicit tag-to-script discovery.

### Bug Fixes

- Fixed Ecopages JSX SSR/hydration wiring for Radiant hosts, intrinsic custom-element assets, mixed-integration delegated children, and page-owned browser bundles.
- Fixed lazy custom-element dependencies to stay as standalone assets instead of being folded into page-owned bundles.
