---
'@ecopages/core': patch
---

Core's browser server-only guard and server CSS shim now declare Rolldown hook filters, so they no longer run for every module of a build. The Node builtin externalizer is gone: Rolldown's node platform already keeps builtins external. A failed output write no longer leaves the Rolldown bundle open.
