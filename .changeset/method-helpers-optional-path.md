---
'@ecopages/core': minor
---

`defineGet`, `definePost` and the other method helpers accept a handler without `path`, for an export of a `*.api.ts` endpoint file, whose path under the pages directory gives the URL. With `path` they behave and infer as before. The `api.get` / `api.post` helpers inside `defineGroupHandler` still require `path`, and `app.add()` and `app.group()` throw for a handler without one.
