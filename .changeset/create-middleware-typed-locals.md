---
'@ecopages/core': minor
---

Middleware now provides typed request locals. `createMiddleware` and `composeMiddleware` are new exports: a stage passes what it provides to `next({ session })`, a later stage reads it from `ctx.locals`, and the route, group or Page that lists the middleware reads the same typed `locals` in its handler or `render`. A later entry overrides an earlier key, and a list typed as a plain array provides nothing. Plain `(ctx, next)` functions keep working and provide no types.

Breaking: `EcoMiddleware<Context>` and the form where middleware adds fields to `ctx` (`ctx.session = ...`) are removed, since a stage now provides locals through `next`. `EcoMiddleware<TLocals>` is now the type of what `createMiddleware` returns. `Middleware` and `FileRouteMiddleware` no longer take a context type parameter, and `RouteOptions` no longer takes `TRequest` and `TServer`. Listing the same middleware stage twice in one list or composition now throws when the route or Page is defined. A stage continues the chain at most once, also from a later stage it started, and `next` throws once its stage has returned. A stage that calls `next()` without awaiting, returning or catching its promise does not hide a failure of the rest of the chain: the failure propagates, while `try { await next() } catch { ... }` answers with the fallback. A middleware is listed only as `createMiddleware` or `composeMiddleware` returned it; a copy throws when the route or Page is defined.

A Page that lists a typed `middleware` array gets its `locals` from the list. `requires` still narrows the global keys it names and decides which locals reach the browser for a React Page.
