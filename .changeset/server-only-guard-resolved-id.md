---
'@ecopages/core': patch
---

A browser build now rejects a `.server` module reached through an alias. An import such as `#db`, mapped to `./src/db.server.ts` by `package.json` `imports` or a tsconfig path, used to reach the browser bundle because only the written specifier was checked. The error names the resolved module and its importer.
