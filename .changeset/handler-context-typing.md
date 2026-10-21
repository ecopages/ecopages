---
'@ecopages/core': minor
---

Type the handler context the same way however a route is defined. A field the route's `schema` declares takes the schema's output type; a field it omits keeps its untyped shape, so a route with only `schema.body` still reads `params` as `PageParams` and `query` as parsed query values instead of `unknown`. Inline routes (`app.get()`, `app.post()` and the other method calls, `app.route()`, and the routes of `app.group()`) now type the handler from their `schema` and middleware, and `api.get()`, `api.post()` and the other method helpers inside `defineGroupHandler` receive the context the group middleware adds.

API handlers now type `ctx.query` as the parsed query values. Page middleware no longer declares `query`, which it never received; read the query string from `request.url`.

The handler context now comes from the route's `schema`, its middleware and its group, not from a type annotation on the handler's parameter. A handler annotated with a context that its route's middleware does not add no longer compiles. Add that middleware to the route or the group; when a route combines middleware that each add a different field, pass the combined context explicitly, schema first and context second: `app.get<RouteSchema, AuthContext & LocaleContext>('/me', handler, { middleware: [withSession, withLocale] })`.
