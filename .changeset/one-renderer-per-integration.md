---
'@ecopages/core': minor
---

Every render of an Integration uses one renderer: routes, handler renders and foreign children of other Integrations. A handler that calls `ctx.render`, `ctx.renderPartial` or `ctx.renderServerModule` no longer builds a renderer, its services and its runtime module lookups on each request.

**Breaking:** `IntegrationPlugin.initializeRenderer()` is called once for each app config, runtime origin and HMR manager, not once per render; core reaches the renderer through the new `IntegrationPlugin.getRenderer()`. A custom Integration whose renderer keeps per-render fields must move that state into the render, because renders now share the instance and overlap.
