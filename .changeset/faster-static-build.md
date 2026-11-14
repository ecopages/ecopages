---
'@ecopages/core': patch
'@ecopages/lit': patch
'@ecopages/react': patch
---

Make `ecopages build` and browser bundling faster. The build resolves each module's real path once instead of on every comparison, and starts Integration static exports, such as the Lit render worker, while the browser graph prebuild runs. The built pages are unchanged.

`ecopages build` now finds `ssr: true` scripts in the first server build, from the literal `src` beside `ssr: true` in a Component's `dependencies.scripts`, instead of importing the built modules and building again. A `src` that is not a string literal fails the build with a message that says so.
