---
'@ecopages/react': patch
---

Strip server-only `eco.page()` options from every module in the React client graph, not only from files under `pages/` and `layouts/`. A binding imported from a `.server` module that is still referenced elsewhere in the module now fails the build naming the module and binding, instead of emitting a bundle that throws a `ReferenceError`.
