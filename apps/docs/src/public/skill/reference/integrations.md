# Integrations

## Contents

- Stack comparison
- MDX ownership rules
- Mixing integrations

## Stack comparison

| Integration    | Technology                         | Primary use                                             |
| -------------- | ---------------------------------- | ------------------------------------------------------- |
| Ecopages JSX   | `@ecopages/jsx` + optional Radiant | Default: `.tsx` Pages, optional MDX                     |
| KitaJS         | `@kitajs/html`                     | `.kita.tsx` Pages                                       |
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

Cross-integration shell stacks: use integration-owned `EcoEmbed` (`@ecopages/ecopages-jsx/eco-embed`, `@ecopages/react/eco-embed`, `@ecopages/kitajs/eco-embed`). It wraps `eco.embed()` so the active foreign-child runtime can queue subtrees in the owning renderer.

Queue boundary: plain opaque objects (values that would stringify to `[object Object]`) throw at the foreign-subtree queue. Pass already-serialized HTML strings, or use `EcoEmbed`. Template results, markup nodes, arrays, and framework element markers (`$$typeof`) are accepted.

## React

```typescript
import { reactPlugin } from '@ecopages/react';

reactPlugin({ mdx: { enabled: true } });
```

Use React only when the user requests it or a dependency requires the React ecosystem.

## Mixing integrations

Multiple integrations can coexist in one `eco.config.ts`. Route ownership is determined by file extension. Each integration owns its extensions and renderer.

## Cross-integration rendering

Authoring rule: use integration-owned `EcoEmbed` when nesting shells across integrations or passing children across integration boundaries. Each integration exports `@ecopages/<name>/eco-embed`.

Runtime contract (for custom integrations):

1. **Queue** foreign subtrees with `createForeignChildRuntime()` / `foreignSubtreeExecutionService.createQueuedRuntime(...)`.
2. **Resolve** queued tokens with `foreignSubtreeExecutionService.resolveQueuedHtml(...)` after local HTML is produced.
3. **Own** subtrees through `resolveOwningIntegrationRenderer` from `@ecopages/core/route-renderer/orchestration/foreign-child/owning-renderer-resolution`.

String-markup integrations can extend `StringMarkupRenderer` to inherit the wired path.

Before queueing, core calls `assertForeignChildrenNotOpaque()` — plain objects throw instead of becoming `[object Object]` in HTML. Acceptable children include HTML strings, template results, markup nodes, arrays, and framework element markers.
