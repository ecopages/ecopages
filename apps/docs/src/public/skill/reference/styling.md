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

In modules declaring `eco.component()`, `eco.layout()`, `eco.html()`, or `eco.page()`, side-effect CSS imports are auto-discovered:

```typescript
import './component.css';
import '@/styles/shared.css';
```

Ecopages automatically extracts these into the asset pipeline, removes the bare import statements from server and client modules, and serves them via `<link rel="stylesheet">`.

For imported stylesheet strings with `postcssProcessorPlugin`:

```typescript
import styles from './styles.css';
```

## Layouts and includes

- `src/includes/html.*` — document shell (`HtmlTemplateProps` with `children`, `metadata`, `pageProps`)
- `src/includes/head.*` — head assets and metadata wiring
- `src/layouts/` — page wrappers via `eco.page({ layout: BaseLayout })`

Relative and aliased CSS imports inside layout and component files are auto-discovered. Use explicit `dependencies.stylesheets` when custom attributes (such as `media="print"`) or manual ordering overrides are required.
