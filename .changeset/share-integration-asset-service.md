---
'@ecopages/core': patch
---

A handler-rendered view reuses its Integration's asset-processing service, so each stylesheet and script is processed once per process instead of on every request.
