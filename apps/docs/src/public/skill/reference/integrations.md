# Integrations

## Contents

- Stack comparison
- MDX ownership rules
- Mixing integrations

## Stack comparison

| Integration    | Technology                         | Primary use                                             |
| -------------- | ---------------------------------- | ------------------------------------------------------- |
| Ecopages JSX   | `@ecopages/jsx` + optional Radiant | Standard `.tsx` routes, optional MDX                    |
| KitaJS         | `@kitajs/html`                     | HTML-first `.kita.tsx` shells                           |
| React          | React 19                           | Dashboards, rich interactivity                          |
| Lit            | Web Components                     | Portable UI, micro-frontends                            |
| Standalone MDX | `@ecopages/mdx`                    | Third-party JSX runtime with explicit `jsxImportSource` |

## MDX ownership rules

Pick the MDX path that matches the owning runtime:

| Runtime                   | Plugin                                                                |
| ------------------------- | --------------------------------------------------------------------- |
| React                     | `reactPlugin({ mdx: { enabled: true } })`                             |
| Ecopages JSX              | `ecopagesJsxPlugin({ mdx: { enabled: true } })`                       |
| Third-party (e.g. KitaJS) | `mdxPlugin({ compilerOptions: { jsxImportSource: '@kitajs/html' } })` |

Standalone `mdxPlugin()` requires `compilerOptions.jsxImportSource`. Passing `react` or `@ecopages/jsx` redirects to the owning integration plugin.

## Ecopages JSX

```typescript
import { ecopagesJsxPlugin } from '@ecopages/ecopages-jsx';

ecopagesJsxPlugin({
	extensions: ['.tsx'],
	radiant: true,
	mdx: { enabled: true, extensions: ['.mdx'] },
});
```

Foreign-child ownership: Ecopages JSX uses renderer-owned foreign children for mixed rendering and Radiant hydration — not blanket client hydration for every component.

## React

```typescript
import { reactPlugin } from '@ecopages/react';

reactPlugin({ mdx: { enabled: true } });
```

Use React only when the user requests it or a dependency requires the React ecosystem.

## Mixing integrations

Multiple integrations can coexist in one `eco.config.ts`. Route ownership is determined by file extension. Each integration owns its extensions and renderer.

## Cross-integration rendering

Foreign-child ownership is a three-step renderer contract: **queue** with `createForeignChildRuntime()` / `foreignSubtreeExecutionService.createQueuedRuntime(...)`, **resolve** with `foreignSubtreeExecutionService.resolveQueuedHtml(...)` after local HTML is produced, and **own** via `resolveOwningIntegrationRenderer` from `@ecopages/core/route-renderer/orchestration/foreign-child/owning-renderer-resolution`. String-markup integrations can extend `StringMarkupRenderer` to inherit the wired path.
