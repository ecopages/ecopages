---
'@ecopages/core': patch
---

A handler-rendered view reuses its Integration's asset-processing service, so an unchanged stylesheet or script is reused across renders until its source changes, its output is missing, or development invalidation drops the entry.
