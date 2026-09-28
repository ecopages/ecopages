# Changelog

## 0.2.0

### Minor Changes

- [`8ee835b`](https://github.com/ecopages/ecopages/commit/8ee835baff535f70469cd9e63e398c65d04b4dee) Thanks [@andeeplus](https://github.com/andeeplus)! - Ecopages JSX owns JSX routes, optional Radiant hydration, and optional MDX compiled against `@ecopages/jsx`. Mixed-integration authoring uses `@ecopages/ecopages-jsx/eco-embed`. Intrinsic custom elements load through explicit `dependencies.scripts`, not implicit tag-to-script discovery.

    `ssr: true` on a script entry registers the custom element on the server. Do not add a side-effect import of that module only for SSR, and do not set `ssr: true` on browser-only scripts.

    ```tsx
    export const ThemeToggle = eco.component({
    	dependencies: {
    		scripts: [{ src: './theme-toggle.script.ts', ssr: true, lazy: { 'on:idle': true } }],
    	},
    	render: () => <theme-toggle />,
    });
    ```

### Patch Changes

- Updated dependencies [[`8ee835b`](https://github.com/ecopages/ecopages/commit/8ee835baff535f70469cd9e63e398c65d04b4dee), [`8ee835b`](https://github.com/ecopages/ecopages/commit/8ee835baff535f70469cd9e63e398c65d04b4dee)]:
    - @ecopages/core@0.2.0
    - @ecopages/mdx@0.2.0

All notable changes to `@ecopages/ecopages-jsx` are documented here.

> Changelog tracking begins at version `0.2.0`. Prerelease history lives in git tags and GitHub Releases.
