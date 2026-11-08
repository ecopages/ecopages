---
'@ecopages/core': patch
---

Prebundle development dependencies in one code-split vendor graph, so a module shared by a package root and its subpath, by two packages, or required as CommonJS by two packages loads once in the browser. A dependency discovered after a page loaded vendor files that the rebuild changes reloads the page, and the discovered dependencies seed the next dev process.
