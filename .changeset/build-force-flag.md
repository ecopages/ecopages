---
'ecopages': patch
---

`ecopages build --force` and `ecopages preview --force` empty `dist` and the build caches, then rebuild everything. The CLI rejected `--force` as an unknown option before, so a clean rebuild needed `.eco` deleted by hand.
