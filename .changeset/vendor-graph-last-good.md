---
'@ecopages/core': patch
'@ecopages/file-system': minor
---

Keep serving the last good vendor output when a dev vendor-graph build fails as a whole, keep every entry in `dev-vendor-entries.json`, rebuild vendors after a package install without a restart, and build the new bare imports of one module in a single vendor build.

`FileStats`, returned by `stat()` and `lstat()`, gains a required `mtimeMs` field; a custom `FileSystem` implementation must now return it.
