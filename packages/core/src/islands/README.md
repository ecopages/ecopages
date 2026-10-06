# Island host contract

Hydratable component instances stamp a small, integration-agnostic attribute set on their SSR root so devtools (and future runtime features) can discover islands without integration-specific selectors.

## Attributes

| Attribute                     | Purpose                                                     |
| ----------------------------- | ----------------------------------------------------------- |
| `data-eco-island`             | Marks the element as an interactive island host             |
| `data-eco-island-integration` | Owning integration (`react`, `lit`, `kitajs`, …)            |
| `data-eco-component-id`       | Stable instance id from the render pipeline                 |
| `data-eco-component-key`      | Optional module key used by client hydration (React)        |
| `data-eco-props`              | Optional props snapshot for hydration: base64 of UTF-8 JSON |

`data-eco-island` is a presence marker with an empty value, rendered as
`data-eco-island=""`. Select hosts with `[data-eco-island]`.

React integrations may emit `<eco-island>` as the SSR host. The host uses
`display: contents` so it does not introduce a layout box, while the host and
its children remain in place as the client calls `hydrateRoot()` on that host.
React island integrations may add `data-eco-hydrated` after the initial client
commit for development diagnostics.

## Where stamping happens

`finalizeIslandComponentRender()` in `island-host.ts` is called from integration renderers when:

1. `integrationContext.componentInstanceId` is present
2. The render result can attach attributes to a single root element
3. The component's own assets include at least one client `script`

Own assets are the scripts and stylesheets the component declares, plus those of nested components of the same Integration, excluding Foreign Children (declared in `dependencies.components` or rendered as Foreign Subtrees) and their descendants. They are passed separately from the render result: `result.assets` keeps the merged list for the Page. `IntegrationRenderer` collects them from the component's dependency declarations, so a component without scripts that wraps another Integration's island is not stamped.

Integrations write `data-eco-props` through `buildIslandHostAttributes()`, which encodes the JSON as UTF-8 before base64; plain `btoa` handles Latin-1 only and throws on text such as `€`, CJK or emoji. Browser code that cannot import core (the React hydration lifecycle and the dev toolbar) keeps its own decoder; their tests and core's test use the same encoded fixture, so a format change fails them.

Integrations with custom island metadata (for example React's component key) should build on `buildIslandHostAttributes()` rather than inventing per-demo selectors.
