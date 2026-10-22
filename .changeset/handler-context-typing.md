---
'@ecopages/core': minor
---

Type the handler context the same way however a route is defined. A field the route's `schema` declares takes the schema's output type; a field it omits keeps its untyped shape, so a route with only `schema.body` still reads `params` as `PageParams` and `query` as parsed query values instead of `unknown`. Inline routes (`app.get()`, `app.post()` and the other method calls, `app.route()`, and the routes of `app.group()`) now type the handler from their `schema` and middleware, and `api.get()`, `api.post()` and the other method helpers inside `defineGroupHandler` receive the context the group middleware adds.

API handlers now type `ctx.query` as the parsed query values. Page middleware no longer declares `query`, which it never received; read the query string from `request.url`.

The handler context now comes from the route's `schema`, its middleware and its group, not from a type annotation on the handler's parameter. A route's handler sees the fields every one of its middleware adds, and a group's routes see what every group middleware adds, so a route with `middleware: [withSession, withLocale]` reads both `ctx.session` and `ctx.locale` without type arguments. A handler annotated with a context that no middleware on its route adds no longer compiles. An inline middleware function in a `middleware` list is typed with the base context.

TypeScript types the handler against the middleware it has already seen, so in a `define*` call put `middleware` before `handler`. In `app.get()` and the other method calls the handler comes first, so declare the middleware the handler relies on as `Middleware` or `EcoMiddleware` constants, or annotate an inline function with `ApiHandlerContext` and the now exported `MiddlewareNext`.

The exported handler context type `TypedGroupHandlerContext` is renamed `RouteHandlerContext`, with no alias. `RouteOptions` now takes the route's schema and middleware list as type parameters instead of a context type.

To migrate:

- Replace `RouteOptions<Request, unknown, MyContext>` with `RouteOptions<Request, unknown>`; the context now comes from the `middleware` list.
- Remove a handler's context annotation and put the middleware that provides those fields in `middleware`, or keep the annotation and pass the context as the route's explicit type argument.
- Rename `TypedGroupHandlerContext` to `RouteHandlerContext`; the type parameters are unchanged.
