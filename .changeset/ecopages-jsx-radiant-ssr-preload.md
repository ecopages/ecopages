---
'@ecopages/core': patch
'@ecopages/ecopages-jsx': minor
'@ecopages/lit': patch
---

# `ssr: true` in `dependencies.scripts` registers custom elements on the server

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
