---
'@ecopages/core': patch
---

`ApiHandler.middleware` is typed as the same read-only `MiddlewareList` that `RouteOptions.middleware` and a group's `middleware` use, with no `any`; `MiddlewareList` is now exported. A handler's middleware list can no longer be pushed to after it is built.
