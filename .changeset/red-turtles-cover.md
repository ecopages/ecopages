---
'@ecopages/react': minor
---

**Breaking:** Remove `externals` from `runtimeModules` entries. Migrate by deleting `externals` and registering each former external that is not React or the router as its own `runtimeModules` entry; sibling imports between registered modules resolve to their shared vendor URLs automatically. A leftover `externals` field in an untyped config is ignored.
