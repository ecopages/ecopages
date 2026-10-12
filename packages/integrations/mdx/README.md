# @ecopages/mdx

Standalone MDX integration for Ecopages third-party JSX runtimes (for example `@kitajs/html`). For React or Ecopages JSX MDX, use the owning integration plugin instead.

## Choose your MDX path

| Runtime      | Plugin                                                       |
| ------------ | ------------------------------------------------------------ |
| React        | `reactPlugin({ mdx: {} })`                                   |
| Ecopages JSX | `ecopagesJsxPlugin({ mdx: {} })`                             |
| Third-party  | `mdxPlugin({ compilerOptions: { jsxImportSource: '...' } })` |

## Installation

```bash
bun add @ecopages/mdx @mdx-js/mdx @kitajs/html
```

`@mdx-js/mdx` is a peer dependency. Install the JSX runtime you set in `compilerOptions.jsxImportSource`.

## Usage

```ts
import { defineConfig } from '@ecopages/core/config';
import { mdxPlugin } from '@ecopages/mdx';

export default defineConfig({
	integrations: [
		mdxPlugin({
			compilerOptions: {
				jsxImportSource: '@kitajs/html',
			},
		}),
	],
});
```

`compilerOptions.jsxImportSource` is **required**. `react` and `@ecopages/jsx` are rejected — use `reactPlugin` or `ecopagesJsxPlugin` for those runtimes.

## Types

```ts
import type { JsxImportSource, KnownJsxImportSource, StandaloneMdxCompilerOptions } from '@ecopages/mdx';
```

`KnownJsxImportSource` is `'@kitajs/html' | 'react' | '@ecopages/jsx'`. `JsxImportSource` also accepts custom runtime strings.

Shared MDX options are exported as `MdxCompilerOptionsInput` from `@ecopages/mdx/core`. Configure `remarkPlugins`,
`rehypePlugins`, and `recmaPlugins` at the top level next to `compilerOptions`; the plugin lists are not accepted inside
`compilerOptions`. The `ReactMdxOptions` and `EcopagesJsxMdxOptions` integration types use this shared shape.

## React MDX

Do not use standalone `mdxPlugin()` for React apps:

```ts
import { reactPlugin } from '@ecopages/react';

reactPlugin({
	mdx: {},
});
```

Providing an `mdx` object enables MDX; omit it to disable MDX. Plugin lists belong at the top level next to `compilerOptions`:

```ts
import remarkGfm from 'remark-gfm';

reactPlugin({
	mdx: {
		compilerOptions: { format: 'mdx' },
		remarkPlugins: [remarkGfm],
	},
});
```

The React MDX loader derives its file filter from `mdx.extensions`, which replace `compilerOptions.mdxExtensions` rather than merging with them. Declaring a custom extension such as `['.react.mdx']` means only those files compile with React — plain `.mdx` files in the same build stay with whichever integration owns them. MDX entries compiled by React are React components and must be rendered through React-owned routes; see `@ecopages/content-processor` for the content-entry ownership contract.

## Dependency discovery in MDX

The core MDX loader plugin automatically discovers top-level component and stylesheet imports in MDX files across all integrations. `projectRoot` is required and comes from the app config (`rootDir`); the loader throws if it is missing.

- **Local components**: Top-level imports of local `eco.component()` declarations are added to `config.dependencies.components`.
- **Stylesheets**: Relative and TSConfig-aliased bare CSS imports (e.g. `import './post.css';` or `import '@/styles/post.css';`) are stripped from the compiled JavaScript. Discovered paths stay on Component identity until collection; they are not copied into `config.dependencies.stylesheets`. Explicit `dependencies.stylesheets` entries remain authoritative for attributes such as `media`.
- **Code blocks and functions**: Markdown code blocks containing import statements and dynamic imports inside functions are distinguished from top-level ESM declarations and remain untouched.
- **Config synthesis**: Every compiled MDX module is attributed with `bindComponentIdentity` and `attachDiscoveredDependencies`. If `export const config = { ... }` is already present, discovered Components merge with explicit ones. The standalone renderer preserves the page config's existing `id` and `integration`, attaches the current page file path, and passes imported MDX layouts to dependency collection with their own identity intact.
