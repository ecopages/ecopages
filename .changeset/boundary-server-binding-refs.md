---
'@ecopages/react': minor
---

The React client-graph boundary now strips server-only `eco.page()` options from every module in the client graph, not only from files under `pages/` and `layouts/`. It also removes top-level code the browser module does not need when only those options used it or when it uses a stripped import. An exported name keeps its binding, set to `undefined`. Removed declarations lose their side effects, so code that must run in the browser belongs in a top-level statement of its own.

Breaking: a browser build now fails when code the browser module needs still uses a binding whose import the boundary removes. That covers a Node built-in, a `.server` module, an `ecopages:content/*/server` module, or a named import outside the declared `pkg{name}` rules. Needed code means a top-level statement, the default export, a client root or an export a browser importer requests. The error names the binding, its import specifier and its `file:line:column`. Before, the build emitted a bundle that threw a `ReferenceError`.
