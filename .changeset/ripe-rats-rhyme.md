---
'@ecopages/core': patch
'@ecopages/react': patch
---

Reject .server module imports in core-owned browser builds with an error naming the importer, while preserving React Pages that use server imports only in pruned server options.
