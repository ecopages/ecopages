---
'@ecopages/core': minor
---

A development render (`NODE_ENV=development`) now fails when a Foreign Child with Dependencies that the route never declared is rendered under a parent that already has a declared Foreign Child. The error names the component's file. Route preparation does not collect such a component's stylesheets and scripts, and rendering no longer adds them, so in production it renders without them.

To migrate: import the component statically from the module that declares it with `eco.component()` (a named re-export works, `export *` does not), list it in its parent's `dependencies.components`, or return it in `components` from the Page's `dependencies` function. A component that is declared but reached only under a parent without an identity file (for example a view not declared with `eco.component()` in its own module) fails with its own message: declare that parent with `eco.component()` in its own module, or list the component from a parent that has one. Production renders are not checked.
