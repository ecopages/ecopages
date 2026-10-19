---
'@ecopages/core': patch
---

Production `ecopages start` now keeps using the prebuilt browser assets for every render of a route, not only the first. Pages that are not served from the HTML cache, such as `cache: 'dynamic'` pages, expired revalidating pages and query variants, no longer fall back to request-time builds that produce different script URLs than the first response.
