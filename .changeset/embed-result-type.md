---
'@ecopages/core': patch
---

Fix `eco.embed()` returning `unknown`: `ResultOf` now reads the return type of the component's callable signature, so the result is the component's element type (for example `string` or `JsxRenderable`). Code that relied on the `unknown` result keeps compiling unless it narrowed it with a cast that no longer matches.
