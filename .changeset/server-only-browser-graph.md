---
'@ecopages/core': patch
'@ecopages/react': patch
---

Node built-ins written without the `node:` prefix (`fs`, `fs/promises`) are now removed from React browser modules like `node:fs`. A React module whose browser code still uses a removed server-only import fails the build naming the module, the binding and the `.server` fix, and the browser guard reports the import chain from the app module to the Node built-in it rejects. The foreign JSX scan reads imports from the parsed module, so specifiers inside comments and strings are no longer followed.
