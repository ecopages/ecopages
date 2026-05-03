# @ecopages/ecopages-jsx

Integration plugin for [@ecopages/jsx](https://www.npmjs.com/package/@ecopages/jsx) templates in Ecopages. Use it when Ecopages JSX should own `.tsx` routes, Radiant-backed web components, or MDX compiled against the `@ecopages/jsx` runtime.

## Installation

```bash
bun add @ecopages/ecopages-jsx @ecopages/radiant
```

`@ecopages/radiant` is a required peer dependency for this package.

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
- Radiant host hydration is activated on the client through an explicit head bootstrap that imports `@ecopages/radiant/client/install-hydrator` before intrinsic custom-element modules load.

That means server-rendered `RadiantElement` hosts hydrate in place only when both the SSR markers and the explicit client hydrator are present. Without the client hydrator, Radiant intentionally falls back to a fresh client render on first connect.

```ts
ecopagesJsxPlugin({
	radiant: true,
});
```

Set `radiant: false` when your JSX pages do not need Radiant SSR or the Radiant browser runtime on a given app.

The plugin bootstrap is intentionally explicit rather than depending on custom-element modules to install the Radiant hydrator opportunistically.

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

Ecopages JSX can own the outer page shell or just the nested boundary. When another integration reaches a JSX-owned boundary, Ecopages hands that boundary back to the JSX renderer so it can serialize the correct output before the outer renderer resumes.

Important:

- Components that may render foreign children must declare those children in `config.dependencies.components`.
- Ecopages validates mixed-renderer ownership from declared dependencies during render preparation. It does not treat rendered HTML alone as the source of truth.
- Ecopages JSX keeps raw-markup preservation and asset collection inside the JSX renderer.
