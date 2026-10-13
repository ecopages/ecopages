---
'@ecopages/core': patch
---

Build plugin transforms now run for a module id with a query, such as `/src/a.ts?v=1`, when the filter matches the path (`/\.ts$/`). On Windows, a path that starts with a drive letter (`C:\app\a.ts`) is no longer read as a plugin namespace, so transforms, `onResolve` and `onLoad` handlers see the full path.
