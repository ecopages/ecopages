---
'@ecopages/core': minor
---

A development render (`NODE_ENV=development`) now fails when a Foreign Child with Dependencies that the route never declared is rendered under a parent that already has a declared Foreign Child. The error names the component's file. Route preparation does not collect such a component's stylesheets and scripts; today they are only added when found during render, and a later release stops that.

To migrate: import the component statically from the module that declares it with `eco.component()` (a named re-export works, `export *` does not), list it in its parent's `dependencies.components`, or return it in `components` from the Page's `dependencies` function. Production renders are not checked.
