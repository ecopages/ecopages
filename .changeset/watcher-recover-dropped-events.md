---
'@ecopages/file-system': patch
---

On macOS, the file watcher now reports edits that the system dropped. While other processes write many files, `fseventsd` drops native events and Node and Bun do not say so, so an edit during a large install or checkout, or one made right after `ready` before the native stream runs, was never picked up. The watcher now rescans its roots about every two seconds, less often on large trees, and reports what differs from what it saw, without repeating changes the native watcher delivered. A rescan runs only on macOS; Linux and Windows report an overflow themselves and are unchanged.
