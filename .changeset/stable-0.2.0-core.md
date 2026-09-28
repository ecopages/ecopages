---
'@ecopages/core': minor
---

First stable release of the app-owned runtime. `createApp()` from `@ecopages/core/create-app` is the entrypoint: Bun when available, Node otherwise. Author-facing config is `defineConfig` and `EcoPagesUserConfig` in `eco.config.ts`. `createApp()` and the CLI load that file when you omit a config object; the CLI accepts `--config`. `rootDir` may be omitted and defaults to `process.cwd()`.

Register an Integration for every route file type. The built-in ghtml Integration (`@ecopages/core/html`) is gone. Declare Pages, Layouts, Html, and Components with `eco.page()`, `eco.layout()`, `eco.html()`, and `eco.component()`. Nested layouts are an outer-to-inner array on `eco.page({ layout })`. Direct local Eco Component imports and relative CSS supply Dependencies by default. Filesystem discovery, matching, and static-generation planning live in `RouteRegistry`. Catch-all matching prefers the most specific discovered Page.

Filesystem `pages/404.*` and `pages/500.*` are the highest-priority custom error pages. Semantic status pages cover 400, 401, 403, 404, 409, and 500. Explicit-route apps use `app.notFound()`, `app.serverError()`, and `app.errorPage()`. Built-in HTML documents exist when you do not author one. Valid `HttpError` statuses are preserved on HTML responses.

Dev servers resolve port collisions through `PortManager`. Changing `eco.config` or supported `.env` files restarts supervised `ecopages dev`. HTML finalization uses one streaming rewriter on every runtime, so Node matches Bun output. `ssr: true` on `dependencies.scripts` registers custom elements on the server.

Custom Integration authors resolve mixed-integration children with `this.resolveQueuedForeignSubtrees(...)`. Do not import `@ecopages/core/bun` or `@ecopages/core/eco`.
