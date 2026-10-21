---
'@ecopages/core': minor
---

Discover `*.api.ts` files under the pages directory as endpoint routes. `src/pages/api/users.api.ts` is the route `/api/users`; `index.api.ts`, `[id].api.ts` and `[...slug].api.ts` follow the Page naming rules, and a Page and an endpoint file on the same pathname fail discovery with the existing duplicate-route error. Endpoint routes are never statically generated, listed in the sitemap or prebuilt as Pages, even when `.ts` is a registered Page extension. The request pipeline does not run endpoint handlers yet, so a request to an endpoint route falls through to the static file fallback and otherwise answers not found.
