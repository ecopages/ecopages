# @ecopages/mdx

Integration plugin for standalone MDX support in Ecopages for non-React JSX runtimes such as `@kitajs/html`. Use it when MDX should render directly on the server without React hydration.

## Installation

```bash
bunx jsr add @ecopages/mdx
```

## Usage

Import and apply the `mdxPlugin` in your `eco.config.ts`:

```ts
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { mdxPlugin } from '@ecopages/mdx';

const config = await new ConfigBuilder()
	.setBaseUrl(import.meta.env.ECOPAGES_BASE_URL)
	.setIntegrations([mdxPlugin()])
	.build();

export default config;
```

By default, the standalone plugin uses:

- `jsxImportSource: '@kitajs/html'`
- `jsxRuntime: 'automatic'`

## What This Integration Owns

- `.mdx` route files.
- Optional `.md` routes when you opt them into `extensions`.
- MDX compilation against a non-React JSX runtime.

## Configure Markdown Extensions

Use `extensions` when both `.mdx` and `.md` files should run through the MDX loader.

```ts
import { mdxPlugin } from '@ecopages/mdx';

mdxPlugin({
	extensions: ['.mdx', '.md'],
});
```

## Compiler Options

Pass `compilerOptions` to add remark, rehype, or recma plugins while keeping the non-React JSX runtime managed by the integration.

```ts
import { mdxPlugin } from '@ecopages/mdx';

mdxPlugin({
	compilerOptions: {
		remarkPlugins: [],
		rehypePlugins: [],
	},
});
```

> [!WARNING]
> React runtimes are intentionally rejected by this standalone plugin.

## Mixed Rendering

Standalone MDX can own the page shell or nested MDX component boundaries in a mixed-renderer app. When another integration reaches an MDX-owned boundary, Ecopages hands that boundary back to the MDX renderer so the MDX runtime can finish serialization before the outer renderer resumes.

Important:

- Components that may render foreign children must declare those children in `config.dependencies.components`.
- Ecopages validates mixed-renderer ownership from declared dependencies during render preparation rather than inferring every boundary from rendered HTML alone.
- Standalone MDX keeps its own page normalization and non-React JSX runtime behavior.

## Using MDX with React

If you are using `@ecopages/react` and building a full React application, **do not** use this standalone MDX plugin. Instead, enable MDX directly within the React plugin configuration to ensure unified hydration, client-side routing, and HMR:

```ts
import { reactPlugin } from '@ecopages/react';
import { ecoRouter } from '@ecopages/react-router';

reactPlugin({
	router: ecoRouter(),
	mdx: { enabled: true },
});
```
