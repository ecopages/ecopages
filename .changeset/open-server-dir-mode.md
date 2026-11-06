---
'@ecopages/core': patch
---

Publish `dist/server` with the same mode as `dist/client` instead of the owner-only mode of a temporary directory, so a deployed image can run the server as a non-root user.
