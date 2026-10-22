---
'@ecopages/core': minor
---

Discover `*.api.ts` files under the pages directory as endpoint routes. `src/pages/api/users.api.ts` is the route `/api/users`; `index.api.ts`, `[id].api.ts` and `[...slug].api.ts` follow the Page naming rules, and two files on the same route, whatever the parameter names, fail discovery with the duplicate-route error: a Page beside an endpoint file, `x/[a].api.ts` beside `x/[b].api.ts`, and now also two Pages such as `[slug].tsx` beside `[id].tsx`. Endpoint routes are never statically generated, listed in the sitemap or prebuilt as Pages, even when `.ts` is a registered Page extension. The request pipeline does not run endpoint handlers yet, so a request to an endpoint route falls through to the static file fallback and otherwise answers not found.
