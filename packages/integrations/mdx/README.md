# @ecopages/mdx

Standalone MDX integration for Ecopages third-party JSX runtimes (for example `@kitajs/html`). For React or Ecopages JSX MDX, use the owning integration plugin instead.

## Choose your MDX path

| Runtime      | Plugin                                                       |
| ------------ | ------------------------------------------------------------ |
| React        | `reactPlugin({ mdx: { enabled: true } })`                    |
| Ecopages JSX | `ecopagesJsxPlugin({ mdx: { enabled: true } })`              |
| Third-party  | `mdxPlugin({ compilerOptions: { jsxImportSource: '...' } })` |

## Installation

```bash
bun add @ecopages/mdx @mdx-js/mdx @kitajs/html
```

`@mdx-js/mdx` is a peer dependency. Install the JSX runtime you set in `compilerOptions.jsxImportSource`.

## Usage

```ts
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { mdxPlugin } from '@ecopages/mdx';

const config = await new ConfigBuilder()
	.setBaseUrl(import.meta.env.ECOPAGES_BASE_URL)
	.setIntegrations([
		mdxPlugin({
			compilerOptions: {
				jsxImportSource: '@kitajs/html',
			},
		}),
	])
	.build();

export default config;
```

`compilerOptions.jsxImportSource` is **required**. `react` and `@ecopages/jsx` are rejected — use `reactPlugin` or `ecopagesJsxPlugin` for those runtimes.

## Types

```ts
import type { JsxImportSource, KnownJsxImportSource, StandaloneMdxCompilerOptions } from '@ecopages/mdx';
```

`KnownJsxImportSource` is `'@kitajs/html' | 'react' | '@ecopages/jsx'`. `JsxImportSource` also accepts custom runtime strings.

Shared MDX loader utilities live at `@ecopages/mdx/core` for internal integration use.

## React MDX

Do not use standalone `mdxPlugin()` for React apps:

```ts
import { reactPlugin } from '@ecopages/react';

reactPlugin({
	mdx: { enabled: true },
});
```
