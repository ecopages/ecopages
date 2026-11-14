---
'@ecopages/core': patch
'@ecopages/lit': patch
'@ecopages/react': patch
---

Make `ecopages build` and browser bundling faster. The build resolves each module's real path once instead of on every comparison, and starts Integration static exports, such as the Lit render worker, while the browser graph prebuild runs. Build output is unchanged.
