---
'@ecopages/core': minor
'ecopages': minor
---

Build plugins receive `addDependency(path)` on the `onLoad` context and can record extra files they read. One reverse index maps those recorded inputs, module closures, and Processor watch roots to the Page Browser Graphs, HTML cache entries, and browser entrypoints that depend on them. The development watcher subscribes to that recorded set plus `additionalWatchPaths`, pages, and public assets, instead of guessing from the whole `src` tree.
