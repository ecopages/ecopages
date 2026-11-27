---
'@ecopages/core': minor
---

A Page's `cache` can now be a function of `{ props, params, query }` that returns `'static'` or `{ revalidate, tags }`, evaluated on every render, so each page of a dynamic route carries its own tags: ``cache: ({ params }) => ({ revalidate: 3600, tags: [`product:${params.slug}`] })``. `invalidateByTags(['product:chair-1'])` then drops only that page. The object form keeps working. New types: `GetCacheStrategy`, `GetCacheStrategyContext` and `StaticCacheStrategyInput`.
