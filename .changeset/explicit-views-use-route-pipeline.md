---
'@ecopages/core': minor
---

A full explicit view renders through the same route pipeline as a filesystem Page.

**Breaking:** `renderToResponse` is removed. `ctx.render`, `ctx.renderServerModule`, explicit static routes, static export, and registered error pages call `renderExplicitView`, which runs a full view through the route pipeline. A full view receives every layout, default metadata, robots meta, and its own page client plan. A partial render stays on the component path. Static export planning resolves the renderer without calling `staticProps`.

Island entries are components whose Integration differs from their parent's. The Html shell is not an island.
