# Integrations

## Contents

- Stack comparison
- MDX ownership rules
- Ecopages JSX
- React
- Mixing integrations
- Cross-integration rendering

## Stack comparison

| Integration           | Technology                                | Default extension | Primary use                                             |
| --------------------- | ----------------------------------------- | ----------------- | ------------------------------------------------------- |
| Ecopages JSX          | `@ecopages/jsx` + Radiant (on by default) | `.tsx`            | Default: Pages, optional MDX                            |
| KitaJS                | `@kitajs/html`                            | `.kita.tsx`       | String-rendered Pages                                   |
| React                 | React 19                                  | `.tsx`            | Dashboards, rich interactivity                          |
| Lit                   | Web Components                            | `.lit.tsx`        | Portable UI, micro-frontends                            |
| Standalone MDX        | `@ecopages/mdx`                           | `.mdx`            | Third-party JSX runtime with explicit `jsxImportSource` |
| HTML Pages (built in) | Plain HTML                                | `.html`           | Pages with no props or Layout; no plugin needed         |

## MDX ownership rules

Pick the MDX path that matches the owning runtime:

| Runtime                   | Plugin                                                                |
| ------------------------- | --------------------------------------------------------------------- |
| React                     | `reactPlugin({ mdx: {} })`                                            |
| Ecopages JSX              | `ecopagesJsxPlugin({ mdx: {} })`                                      |
| Third-party (e.g. KitaJS) | `mdxPlugin({ compilerOptions: { jsxImportSource: '@kitajs/html' } })` |

Standalone `mdxPlugin()` requires `compilerOptions.jsxImportSource`. With `react` or `@ecopages/jsx` it throws; configure `reactPlugin({ mdx })` or `ecopagesJsxPlugin({ mdx })` instead.

## Ecopages JSX

```typescript
import { ecopagesJsxPlugin } from '@ecopages/ecopages-jsx';

ecopagesJsxPlugin({ mdx: {} });
```

Defaults: `extensions: ['.tsx']`, `radiant: true` (set `radiant: false` when Pages use no Radiant web components), and `.mdx` for MDX when `mdx` is set.

Radiant hydration follows the Ecopages JSX SSR Policy, per Page or Component, not one global hydration bundle.

## React

```typescript
import { reactPlugin } from '@ecopages/react';

reactPlugin({ mdx: {} });
```

Use React only when the user requests it or a dependency requires the React ecosystem.

## Mixing integrations

Multiple Integrations can coexist in one `eco.config.ts`. A Page belongs to the Integration that registers its extension, and each extension belongs to exactly one Integration, or config fails. React and Ecopages JSX both default to `.tsx`: when you mix them, give one distinct `extensions` (for example `['.react.tsx']`).

- Core adds the `.html` Integration unless one of yours registers `.html`.
- No Integration may register `.api.ts`, `.api.tsx`, `.api.js` or `.api.jsx`; they are reserved for Endpoints, and config fails naming the Integration.

## Cross-integration rendering

Authoring rule: when a Component renders a Foreign Child (a Component owned by another Integration), wrap it in that Integration's `EcoEmbed`. `@ecopages/ecopages-jsx`, `@ecopages/react` and `@ecopages/kitajs` export `./eco-embed`; it wraps `eco.embed()` so the owning renderer renders the subtree.

```tsx
import { EcoEmbed } from '@ecopages/react/eco-embed';

<EcoEmbed component={Widget} props={{ title: 'Hi' }}>
	{children}
</EcoEmbed>;
```

Plain opaque objects (values that would stringify to `[object Object]`) throw at the foreign-subtree queue. Pass already-serialized HTML strings, or use `EcoEmbed`. Template results, markup nodes, arrays, and framework element markers (`$$typeof`) are accepted.

Runtime contract (for custom Integrations): renderers built with `createIntegrationRenderer()` (or `StringMarkupRenderer`) already queue Foreign Children and resolve the queued subtrees in their owning renderers; supply the `renderQueuedChildren` hook if needed.
