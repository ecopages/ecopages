---
'ecopages': patch
---

Stopping `ecopages dev` or any other server command with `SIGTERM` or `SIGINT` now stops the server it started. Before, the command exited and left the server running with its port in use.
