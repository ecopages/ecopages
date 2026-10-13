---
'@ecopages/core': patch
---

Core's Node builtin externalizer, browser server-only guard and server CSS shim now declare Rolldown hook filters, so they no longer run for every module of a build. A failed output write no longer leaves the Rolldown bundle open.
