---
'@ecopages/core': minor
---

Every render of an Integration uses one renderer: routes, handler renders and foreign children of other Integrations. A handler that calls `ctx.render`, `ctx.renderPartial` or `ctx.renderServerModule` no longer builds a renderer, its services and its runtime module lookups on each request.

**Breaking:** `IntegrationPlugin.initializeRenderer()` is called when the Integration has no renderer yet, and again after its app config, runtime origin or HMR manager changes, not once per render. `IntegrationPlugin.setConfig()` with the config the Integration already has changes nothing; core reaches the renderer through the new `IntegrationPlugin.getRenderer()`. A custom Integration whose renderer keeps per-render fields must move that state into the render, because renders now share the instance and overlap.
