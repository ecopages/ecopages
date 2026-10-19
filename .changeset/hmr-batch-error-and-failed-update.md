---
'@ecopages/core': patch
'@ecopages/file-system': patch
---

A build error from one file in a multi-file save now stays visible instead of being cleared by the hot update of another file in the same save. A hot update that cannot be applied, for example because a module throws when it is evaluated, now reloads the page instead of leaving a stale page. The file system toolkit gains `realpath`, and the workspace package watcher uses it instead of `node:fs`.
