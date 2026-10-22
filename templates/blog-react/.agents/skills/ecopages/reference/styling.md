# Styling

## Contents

- Tailwind v4 setup
- CSS imports
- Layouts and includes

## Tailwind v4 setup

Register the PostCSS Processor with `tailwindV4Preset({ referencePath })` in `eco.config.ts`, as in [getting-started.md](getting-started.md#configuration). `referencePath` points at the stylesheet below.

`src/styles/app.css`:

```css
@import 'tailwindcss';

:root {
	--background: oklch(0.98 0.004 85);
	--foreground: oklch(0.18 0.02 265);
}

@theme inline {
	--color-primary: oklch(0.55 0.18 35);
	--color-background: var(--background);
	--color-foreground: var(--foreground);
	--font-sans: 'Inter', sans-serif;
}
```

Every `--color-*` in `@theme` becomes a utility (`bg-background`, `text-foreground`); a variable only in `:root` does not.

Load the global stylesheet once, with `import '../styles/app.css'` in `src/includes/html.*` or `src/includes/head.*`.

## CSS imports

Side-effect CSS imports (`import './component.css'`, `import '@/styles/shared.css'`) in `eco.*` modules are discovered and served as `<link rel="stylesheet">`; see [core.md](core.md#components-and-dependency-discovery). Use explicit `dependencies.stylesheets` for custom attributes (such as `media="print"`) or a fixed order.

With `postcssProcessorPlugin`, a value import binds the processed CSS as a string, for example to style a shadow root:

```typescript
import styles from './styles.css';
```

## Layouts and includes

- `src/includes/html.*` — document shell (`HtmlTemplateProps` with `children`, `metadata`, `pageProps`)
- `src/includes/head.*` — head assets and metadata wiring
- `src/layouts/` — page wrappers via `eco.page({ layout: BaseLayout })`
