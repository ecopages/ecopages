---
'@ecopages/core': patch
---

Development page modules compile to a generation-specific filename on every runtime. The in-memory import cache is keyed by the file, its reuse identity, and its source hash.
