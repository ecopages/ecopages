---
'@ecopages/core': minor
'@ecopages/file-system': minor
---

Use native recursive filesystem watchers, support adding paths to a running watch, report directory changes, and handle missing watch roots. When a native event omits its filename, reconcile the root and may emit rescan events for mapped requested roots; the Project Watcher coalesces them into a runtime restart request. Native events are coalesced for 50 ms, so a change may be reported while a file is still being written. Remove Chokidar from file-system and core.
