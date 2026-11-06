---
'@ecopages/react': minor
---

The React client-graph boundary now strips server-only `eco.page()` options from every module in the client graph, not only from files under `pages/` and `layouts/`, and also removes the top-level helpers and imports only those options used. In a module that calls `eco.page()`, the legacy `getMetadata`, `getStaticProps` and `getStaticPaths` exports become `undefined` in the browser.

Breaking: a browser build now fails when kept code still uses a binding whose import the boundary removes (a Node built-in, a `.server` module, an `ecopages:content/*/server` module or a named import outside the declared `pkg{name}` rules). The error names the binding, its import specifier and its `file:line:column`. Before, the build emitted a bundle that threw a `ReferenceError` when it ran the code. Move such code into a server-only Page option or a helper only those options use.
