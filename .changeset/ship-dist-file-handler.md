---
'@ecopages/core': patch
---

Fix `ecopages dev`, `build`, `start` and `preview` failing with `ERR_MODULE_NOT_FOUND` in 0.3.0: the published package was missing the module that serves built files.
