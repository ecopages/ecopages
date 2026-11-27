---
'@ecopages/file-system': patch
---

On macOS under Node, the file watcher's `ready` and `add()` now wait until the native watcher is running, so an edit made right after them is reported. Before, `fs.watch` returned before its event stream started, and on a busy machine an early edit went unreported. The watcher re-applies each new root's existing permissions, which leaves its content and its access and modification times as they are, until the watcher reports the root itself. A root that never reports delays `ready` or `add()` by up to three seconds.
