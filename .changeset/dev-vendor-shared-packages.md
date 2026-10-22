---
'@ecopages/core': patch
---

In `ecopages dev`, a package that several browser dependencies import loads once. Each dependency was prebundled with its own copy of the packages it imports, so libraries that rely on one module instance broke in development only: for example, a Tiptap editor failed with "Adding different instances of a keyed plugin". Dependencies are now served one package per file, and an `import` of another package points at that package's file. Production builds are unchanged.

Build plugins' `onResolve` callback also receives `kind`, how the importer refers to the module (`import-statement`, `dynamic-import`, `require-call`, …).
