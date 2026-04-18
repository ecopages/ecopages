# @ecopages/lit

Integration plugin for [Lit](https://lit.dev/) in Ecopages. Use it when Lit should own `.lit.tsx` routes or when another integration needs Lit to render nested custom-element boundaries.

## Installation

```bash
bunx jsr add @ecopages/lit
```

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

When a non-Lit render pass enters a Lit-owned component boundary, Ecopages hands that boundary to the Lit renderer. That keeps Lit SSR in charge of custom elements, declarative shadow DOM, and Lit-managed child content.

Important:

- Components that may render foreign children must declare those children in `config.dependencies.components`.
- Ecopages validates ownership from declared dependencies during render preparation instead of relying on post-render HTML discovery.
- Lit keeps slot transport, shadow-root handling, and SSR preload behavior inside the Lit renderer.
