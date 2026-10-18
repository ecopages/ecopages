---
'@ecopages/core': minor
---

A full explicit view renders through the same route pipeline as a filesystem Page.

**Breaking:** `renderToResponse` is removed. `ctx.render`, `ctx.renderServerModule`, explicit static routes, static export, and registered error pages call `renderExplicitView`, which runs a full view through the route pipeline. A full view receives every layout, default metadata, robots meta, and its own page client plan. The props passed to the render are the view's final props: they are available to its `metadata`, and the render does not run the view's `staticProps` (explicit static routes and static export run it once, with the route's params, before rendering). `ctx.render`, `ctx.renderServerModule` and `ctx.renderPartial` forward the handler's request locals, route params and query, so a view can read them and its `metadata` receives the params. Static export reuses the metadata of the render for the sitemap instead of calling `metadata` again. A partial render stays on the component path. Static export planning resolves the renderer without calling `staticProps`.

Island entries are components whose Integration differs from their parent's. The Html shell is not an island.
