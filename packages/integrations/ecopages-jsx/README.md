# @ecopages/ecopages-jsx

Integration plugin for [@ecopages/jsx](https://www.npmjs.com/package/@ecopages/jsx) templates in Ecopages. Use it when Ecopages JSX should own `.tsx` routes, Radiant-backed web components, or MDX compiled against the `@ecopages/jsx` runtime.

## Installation

```bash
bun add @ecopages/ecopages-jsx @ecopages/jsx @ecopages/radiant
```

`@ecopages/jsx` and `@ecopages/radiant` are required peer dependencies for this package.

## Usage

Register the `ecopagesJsxPlugin` in your `eco.config.ts`.

```ts
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { ecopagesJsxPlugin } from '@ecopages/ecopages-jsx';

const config = await new ConfigBuilder()
	.setBaseUrl(import.meta.env.ECOPAGES_BASE_URL)
	.setIntegrations([ecopagesJsxPlugin()])
	.build();

export default config;
```

## What This Integration Owns

- `.tsx` route files by default. Use `extensions` to change the JSX route suffix list.
- Optional Radiant SSR/runtime wiring through the public `@ecopages/radiant` entrypoints.
- Optional `.mdx` routes compiled against the `@ecopages/jsx` runtime.

## Route Extensions

Use `extensions` when JSX routes should use a custom suffix instead of the default `.tsx`.

```ts
ecopagesJsxPlugin({
	extensions: ['.page.tsx'],
});
```

## Radiant Support

Radiant support is enabled by default. When `radiant: true`, the plugin keeps the ownership split explicit:

- Ecopages JSX owns page-level JSX SSR and container hydration.
- Radiant SSR is activated on the server through `@ecopages/radiant/server/render-component`.
- The server reuses Radiant's complete light-DOM surface, replacing partial globals before Radiant elements are imported.
- Radiant host hydration is activated on the client through an explicit head bootstrap that imports `@ecopages/radiant/client/install-hydrator` before intrinsic custom-element modules load.

That means server-rendered `RadiantElement` hosts hydrate in place only when both the SSR markers and the explicit client hydrator are present. Without the client hydrator, Radiant intentionally falls back to a fresh client render on first connect.

### Hydration Semantics: RadiantElement vs. RadiantController

- **`RadiantElement` (DOM Preservation)**: Custom elements extending `RadiantElement` support true in-place hydration. When `@ecopages/radiant/client/install-hydrator` executes before elements connect, existing light-DOM SSR nodes are preserved, retaining DOM node identity, form input state, active focus, and media playback.
- **`RadiantController` (Activation / Template Re-mount)**: Controllers attached via `[data-controller]` activate when `startControllers(document)` is called. Activation executes the controller's `render()` method and mounts its template fresh into the host container, replacing server-rendered child nodes. Reactive properties and signal bindings remain fully interactive, but individual child DOM nodes are reconstructed.
- **Guidance**: Use `RadiantElement` when in-place preservation of SSR nodes (e.g., focused inputs, media elements, or CSS transitions) is required. Use `RadiantController` for Stimulus-style progressive enhancement on arbitrary markup where child DOM reconstruction is acceptable.

```ts
ecopagesJsxPlugin({
	radiant: true,
});
```

Set `radiant: false` when your JSX pages do not need Radiant SSR or the Radiant browser runtime on a given app.

The plugin bootstrap is intentionally explicit rather than depending on custom-element modules to install the Radiant hydrator opportunistically.

For server-side custom-element examples, prefer explicit SSR modes over the older boolean-only contract.

```ts
new MyElement().renderHostToString({ mode: 'plain' });
new MyElement().renderHostToString({ mode: 'hydrate' });
```

The legacy `hydrate: true` option remains compatible, but `mode` is the current SSR contract. Registered intrinsic tags that contain a dash are SSR candidates, and framework-specific host rendering should be adapted through the server custom-element render hook instead of hardcoding framework branches into JSX page code.

The integration loads Radiant host serialization through the public `@ecopages/radiant/server/radiant-element-ssr` export after installing the light-DOM shim. Applications do not need a separate Radiant SSR side-effect import.

### Registered Radiant scripts (`ssr: true`)

Declare custom-element registration once in `dependencies.scripts`. Ecopages JSX preloads entries marked `ssr: true` on the server before render so hosts can SSR without a redundant `import './my-element.script.ts'` in the component file.

```ts
export const ThemeToggle = eco.component({
	dependencies: {
		scripts: [{ src: './theme-toggle.script.ts', ssr: true, lazy: { 'on:idle': true } }],
	},
	render: () => <theme-toggle />,
});
```

Keep `import type` when you only need props from the script module. Do not add `ssr: true` to browser-only scripts that touch `window` or `document` without guards.

## MDX Support

Enable MDX to treat `.mdx` files as JSX routes compiled against the `@ecopages/jsx` runtime.

```ts
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { ecopagesJsxPlugin } from '@ecopages/ecopages-jsx';

const config = await new ConfigBuilder()
	.setIntegrations([
		ecopagesJsxPlugin({
			mdx: {
				enabled: true,
				extensions: ['.mdx', '.md'],
			},
		}),
	])
	.build();

export default config;
```

## Mixed Rendering

Ecopages JSX can own the outer page shell or just a nested foreign subtree. When another integration reaches a JSX-owned foreign child, Ecopages hands that foreign subtree back to the JSX renderer so it can serialize the correct output before the outer renderer resumes.

Important:

- Cross-integration shell stacks should use `EcoEmbed` from `@ecopages/ecopages-jsx/eco-embed` (or the matching integration adapter). Plain opaque objects fail fast at core foreign-subtree queue boundaries; they are not coerced with `String(object)`. Pass already-serialized HTML when `EcoEmbed` is not needed.
- Components that may render foreign children must declare those children in `config.dependencies.components`.
- Ecopages validates mixed-renderer ownership from declared dependencies during render preparation. It does not treat rendered HTML alone as the source of truth.
- Route-level dependency resolvers can supply Components at request time; Ecopages JSX includes those resolved roots when deciding whether a Foreign Subtree needs handoff.
- Ecopages JSX keeps raw-markup preservation and asset collection inside the JSX renderer.
