# Styling

## Contents

- Tailwind v4 setup
- PostCSS processor
- CSS imports
- Layouts and includes

## Tailwind v4 setup

`src/styles/app.css`:

```css
@import 'tailwindcss';

@theme inline {
	--color-primary: oklch(0.55 0.18 35);
	--font-sans: 'Inter', sans-serif;
}

:root {
	--color-background: oklch(0.98 0.004 85);
	--color-foreground: oklch(0.18 0.02 265);
}
```

Register PostCSS in `eco.config.ts`:

```typescript
import { postcssProcessorPlugin } from '@ecopages/postcss-processor';
import { tailwindV4Preset } from '@ecopages/postcss-processor/presets/tailwind-v4';

postcssProcessorPlugin(
	tailwindV4Preset({
		referencePath: path.resolve(appRoot, 'src/styles/app.css'),
	}),
);
```

## CSS imports

With `postcssProcessorPlugin` registered:

```typescript
import styles from './styles.css';
```

Ecopages build plugins handle CSS as processed strings in JS/TS modules.

## Layouts and includes

- `src/includes/html.*` — document shell (`HtmlTemplateProps` with `children`, `metadata`, `pageProps`)
- `src/includes/head.*` — head assets and metadata wiring
- `src/layouts/` — page wrappers via `eco.page({ dependencies: { components: [BaseLayout] } })`

Declare stylesheets in component `dependencies.stylesheets`, not by filename convention alone.
