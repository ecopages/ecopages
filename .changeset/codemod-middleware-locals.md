---
'@ecopages/codemod': minor
---

New `migrate-middleware-locals` transform. It moves the `ctx.locals.x = value` assignments of a `FileRouteMiddleware` or `Middleware` into `createMiddleware` and `next({ x: value })`, moves the `locals` a simple dynamic page reads in `render` into a new `props` hook and drops its `requires`, and prints a migration brief for the cases it leaves: `EcoMiddleware<Context>` forms, assignments it cannot move, pages that still declare `requires` or read `locals` in `render`, and `interface RequestLocals` augmentations of `@ecopages/core`, which type nothing now that the global interface is removed.
