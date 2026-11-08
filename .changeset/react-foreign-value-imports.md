---
'@ecopages/react': patch
---

Fix the foreign Eco Component import rewrite wrapping bindings that are not values. A type imported without the `type` keyword no longer fails the build, an unused foreign import is tree-shaken again, and a React-only name of a barrel that also `export *`s a foreign module is left untouched.
