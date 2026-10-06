---
'@ecopages/core': patch
---

Editing a file in the public directory or one matched by `additionalWatchPaths` now reloads the page under the Vite plugin, or any host that serves the Ecopages HMR runtime, as it does under `ecopages dev`. These edits previously needed a manual reload there.
