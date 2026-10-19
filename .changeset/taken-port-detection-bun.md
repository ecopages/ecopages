---
'@ecopages/core': patch
---

Detect a taken port under Bun. When the dev or preview port was already in use on `localhost`, Bun bound the server to another address that `localhost` resolves to, so two servers listened on the same origin and requests were split between them. The server now binds the same single address on Bun and Node, so a taken port falls back to the next free port, or fails when the port is pinned with `--port` or `ECOPAGES_PORT`.
