---
'@ecopages/core': patch
---

Wait for in-flight page-cache regenerations before Integration teardown when the app stops, so a stale revalidating-cache Page cannot keep rendering after its Integration is released.
