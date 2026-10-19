---
'@ecopages/core': patch
---

Remove the single-file change method from the HMR manager contract that integrations receive; pass a one-item list to `handleFileChanges()` instead. HMR client events and file-change options no longer carry the unused `graphIdentities` field.
