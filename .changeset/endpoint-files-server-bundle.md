---
'@ecopages/core': minor
---

Emit the server bundle when the pages directory holds an endpoint file. A build of an app whose only handlers are `*.api.ts` files now writes `dist/.server/`, so `ecopages start` runs it and answers the endpoint URLs; before, the app built as static-only and its endpoints worked only in development.
