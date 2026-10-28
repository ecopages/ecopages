---
'@ecopages/file-system': patch
'@ecopages/core': patch
---

`watch()` no longer descends into subtrees its `ignored` predicate ignores without stats, so on Linux a recursive root does not open kernel watches for `node_modules` and similar folders. A directory removed while it is being indexed is treated as gone instead of reported as a watcher error, a directory found after `close()` opens no new native watcher, and a folder allowed by a later `add()` reports its changes. The development watcher also reports a build input recorded after startup when it lies under an additional watch path base, and production start rejects an unreadable browser client manifest instead of starting without it.
