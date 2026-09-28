---
'@ecopages/ecopages-jsx': minor
---

Ecopages JSX owns JSX routes, optional Radiant hydration, and optional MDX compiled against `@ecopages/jsx`. Mixed-integration authoring uses `@ecopages/ecopages-jsx/eco-embed`. Intrinsic custom elements load through explicit `dependencies.scripts`, not implicit tag-to-script discovery.

`ssr: true` on a script entry registers the custom element on the server. Do not add a side-effect import of that module only for SSR, and do not set `ssr: true` on browser-only scripts.

```tsx
export const ThemeToggle = eco.component({
	dependencies: {
		scripts: [{ src: './theme-toggle.script.ts', ssr: true, lazy: { 'on:idle': true } }],
	},
	render: () => <theme-toggle />,
});
```
