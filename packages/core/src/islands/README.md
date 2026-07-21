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

React may still replace the SSR host with `<eco-island>` after hydration; the marker is applied at SSR time on the component root.

## Where stamping happens

`finalizeIslandComponentRender()` in `island-host.ts` is called from integration renderers when:

1. `integrationContext.componentInstanceId` is present
2. The render result can attach attributes to a single root element
3. The render emits at least one client `script` asset

Integrations with custom island metadata (for example React's component key) should build on `buildIslandHostAttributes()` rather than inventing per-demo selectors.
