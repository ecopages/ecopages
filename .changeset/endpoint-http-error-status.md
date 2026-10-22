---
'@ecopages/core': patch
---

An `HttpError` thrown from an endpoint file now answers with its status and JSON body, as it does from an `app.ts` route. It answered `500` before, because the endpoint file loads its own copy of `@ecopages/core/errors`.
