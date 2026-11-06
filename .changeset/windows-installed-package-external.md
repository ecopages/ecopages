---
'@ecopages/core': patch
---

Keep installed compiled packages external on Windows when they sit on another drive than the build output directory. Their native bindings, such as the one in `oxc-resolver`, were bundled and failed to load.
