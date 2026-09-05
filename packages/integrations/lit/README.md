# @ecopages/lit

Integration plugin for [Lit](https://lit.dev/) in Ecopages. Use it when Lit should own `.lit.tsx` routes or when another integration needs Lit to render nested custom-element boundaries.

## Installation

```bash
bun add @ecopages/lit lit @lit-labs/ssr @lit-labs/ssr-client
```

`lit`, `@lit-labs/ssr`, and `@lit-labs/ssr-client` are required peer dependencies for this package.

## Usage

Register `litPlugin()` in your `eco.config.ts`.

```ts
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { litPlugin } from '@ecopages/lit';

const config = await new ConfigBuilder()
	.setBaseUrl(import.meta.env.ECOPAGES_BASE_URL)
	.setIntegrations([litPlugin()])
	.build();

export default config;
```

Lit also works well alongside an HTML-first renderer such as `@ecopages/kitajs` when you want Lit to own only the nested custom elements:

```ts
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { kitajsPlugin } from '@ecopages/kitajs';
import { litPlugin } from '@ecopages/lit';

const config = await new ConfigBuilder()
	.setBaseUrl(import.meta.env.ECOPAGES_BASE_URL)
	.setIntegrations([kitajsPlugin(), litPlugin()])
	.build();

export default config;
```

This setup lets Kita own the page shell while Lit owns the nested Lit component boundaries.

## What This Integration Owns

- `.lit.tsx` route files.
- Nested Lit component boundaries rendered inside pages owned by other integrations.
- The Lit hydration support script required for SSR custom elements and declarative shadow DOM.

## Mixed Rendering

When a non-Lit render pass reaches a Lit-owned foreign child, Ecopages hands that foreign subtree to the Lit renderer. That keeps Lit SSR in charge of custom elements, declarative shadow DOM, and Lit-managed child content.

Important:

- Direct local imports of declared Eco Components contribute their Dependencies automatically, including Foreign Children. Use `dependencies.components` for unsupported discovery patterns such as barrel re-exports and package imports.
- Ecopages validates ownership from declared dependencies during render preparation instead of relying on post-render HTML discovery.
- Lit keeps slot transport, shadow-root handling, and SSR preload behavior inside the Lit renderer.

## Discovered assets and lazy custom elements

A Lit Component can import a relative stylesheet with `import './counter.css'`; core extracts it into the shared asset pipeline. Direct local imports of that Component make its Dependencies available to the Lit SSR preloader, including through Foreign Child rendering.

Keep custom-element registration explicit with `scripts: [{ src: './counter.script.ts', ssr: true, lazy: { 'on:visible': true } }]`. The module executes before server rendering and loads in the browser on visibility. `ssr: true` no longer emits an additional eager browser script. Omit `lazy` when eager browser loading is intended. SSR preload artifacts are excluded from HTML, and hydration support must be available before the browser registers the element.
