---
'@ecopages/core': patch
---

Persisted build caches now read and parse each shared chunk once per build instead of once per page, and discard entries written before import validation existed.
