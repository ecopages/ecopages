# Island host contract

Hydratable component instances stamp a small, integration-agnostic attribute set on their SSR root so devtools (and future runtime features) can discover islands without integration-specific selectors.

## Attributes

| Attribute                     | Purpose                                              |
| ----------------------------- | ---------------------------------------------------- |
| `data-eco-island`             | Marks the element as an interactive island host      |
| `data-eco-island-integration` | Owning integration (`react`, `lit`, `kitajs`, …)     |
| `data-eco-component-id`       | Stable instance id from the render pipeline          |
| `data-eco-component-key`      | Optional module key used by client hydration (React) |
| `data-eco-props`              | Optional base64 JSON props snapshot for hydration    |

React integrations may emit `<eco-island>` as the SSR host. The host uses
`display: contents` so it does not introduce a layout box, while the host and
its children remain in place as the client calls `hydrateRoot()` on that host.
React island integrations may add `data-eco-hydrated` after the initial client
commit for development diagnostics.

## Where stamping happens

`finalizeIslandComponentRender()` in `island-host.ts` is called from integration renderers when:

1. `integrationContext.componentInstanceId` is present
2. The render result can attach attributes to a single root element
3. The render emits at least one client `script` asset

Integrations with custom island metadata (for example React's component key) should build on `buildIslandHostAttributes()` rather than inventing per-demo selectors.
