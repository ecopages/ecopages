# Changelog

## 0.2.0-rc.11

### Patch Changes

- Updated dependencies [[`092502a`](https://github.com/ecopages/ecopages/commit/092502aa9cd169e7a03a7bb97d7f16685c9c7146), [`f09227f`](https://github.com/ecopages/ecopages/commit/f09227f22184ceebf577a8227b38df42a77f46eb), [`6fb4725`](https://github.com/ecopages/ecopages/commit/6fb4725ea4fcf0ea1773bfadcd154702434e0502), [`bcbda3d`](https://github.com/ecopages/ecopages/commit/bcbda3df0bbbe57e85a57789bbbb92c881053f9a), [`faa6221`](https://github.com/ecopages/ecopages/commit/faa622198dc55677b309bb2e4e7ae7c96677886f), [`f815c41`](https://github.com/ecopages/ecopages/commit/f815c411772048af88c3319561a35af6def9a430)]:
    - @ecopages/core@0.2.0-rc.11

## 0.2.0-rc.10

### Patch Changes

- Updated dependencies [[`22fd810`](https://github.com/ecopages/ecopages/commit/22fd8105d0b0a3a1de25962ea22d758440edbbb1), [`a176633`](https://github.com/ecopages/ecopages/commit/a176633eb8ae84da9a64cf9d7d8ad210fda371e5), [`f669755`](https://github.com/ecopages/ecopages/commit/f669755186973edd702c78d8d9e0e726f982b3a8), [`c3c2331`](https://github.com/ecopages/ecopages/commit/c3c2331ee88fb9b383a384e3d35568876c1d9fd3)]:
    - @ecopages/core@0.2.0-rc.10

## 0.2.0-rc.9

### Patch Changes

- Updated dependencies [[`5a58517`](https://github.com/ecopages/ecopages/commit/5a58517de1f896240bb54858e12af9b872a76bb2)]:
    - @ecopages/core@0.2.0-rc.9

## 0.2.0-rc.8

### Patch Changes

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

- [#310](https://github.com/ecopages/ecopages/pull/310) [`886c7c3`](https://github.com/ecopages/ecopages/commit/886c7c31eeb389f540f5450e47b927b252f36bdb) Thanks [@andeeplus](https://github.com/andeeplus)! - Fix Lit page SSR in the static-render worker: preload `ssr: true` scripts through the app module loader so custom elements emit declarative shadow roots again.
- Updated dependencies [[`e31f76b`](https://github.com/ecopages/ecopages/commit/e31f76b552abdd349c3ae7d94ffe20bb4384456a)]:
    - @ecopages/core@0.2.0-rc.8

## 0.2.0-rc.7

### Patch Changes

- [#291](https://github.com/ecopages/ecopages/pull/291) [`f167916`](https://github.com/ecopages/ecopages/commit/f167916f5159e4ecf421db3d8b199089d6bf6171) Thanks [@andeeplus](https://github.com/andeeplus)! - Fix catch-all request matching so the most specific discovered Page wins, root browser runtime package resolution at the application directory while honoring ESM import conditions, and preserve route-resolved dependency roots through every document-shell renderer.
- Updated dependencies [[`2fa58cb`](https://github.com/ecopages/ecopages/commit/2fa58cb2e12115aa26e2a4bf3d8ea9132f029657), [`f167916`](https://github.com/ecopages/ecopages/commit/f167916f5159e4ecf421db3d8b199089d6bf6171)]:
    - @ecopages/core@0.2.0-rc.7

## 0.2.0-rc.6

### Patch Changes

- Updated dependencies [[`e1ba6d9`](https://github.com/ecopages/ecopages/commit/e1ba6d9f00323a618c61dbc6e1ca46da24cdf134)]:
    - @ecopages/core@0.2.0-rc.6

## 0.2.0-rc.5

### Patch Changes

- Updated dependencies [[`033ac3d`](https://github.com/ecopages/ecopages/commit/033ac3d35b89136d390fa167313ce234bf864d5d)]:
    - @ecopages/core@0.2.0-rc.5

All notable changes to `@ecopages/lit` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Bug Fixes

- Fixed Lit document-shell composition, declarative shadow DOM SSR, nested child serialization, lazy preload handling, and mixed-renderer foreign-subtree resolution.
- Wrapped the inline Lit hydrate-support bootstrap in its own scope so preview pages do not leak minified helper globals across other scripts.
