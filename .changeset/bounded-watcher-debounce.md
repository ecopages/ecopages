---
'@ecopages/core': patch
---

The dev file watcher applies a continuous stream of edits at least once per second instead of waiting for it to pause, fails startup with a clear error if the watcher is not ready within 30 seconds, and logs error stacks for watcher, prewarm and static generation failures.
