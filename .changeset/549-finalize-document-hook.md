---
'@ecopages/core': minor
---

`createIntegrationRenderer()` supports a `finalizeDocument` hook for integration-owned reconciliation after core transforms the response. HTML Pages uses this hook to reconcile its Page head and root attributes for route responses.
