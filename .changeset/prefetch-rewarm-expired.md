---
'@ecopages/browser-router': patch
---

Warm a page again once its copy has expired. A link to a `{ revalidate: N }` page that was prefetched or visited used to stay unprefetched for the whole session, so the click after the copy expired always waited for the network. The router now forgets such a page when its cached copy expires or is invalidated, and the next hover prefetches it. A `no-store` page is still prefetched once.
