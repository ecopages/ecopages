---
'@ecopages/core': patch
'@ecopages/file-system': patch
---

Keep serving the last good vendor output when a dev vendor-graph build fails as a whole, keep every entry in `dev-vendor-entries.json`, rebuild vendors after a package install without a restart, and build the new bare imports of one module in a single vendor build. `stat()` and `lstat()` now also return `mtimeMs`.
