---
'@ecopages/core': patch
---

Refuse a Node WebSocket upgrade with an HTTP error when the handler's `context()` rejects, instead of opening the socket and closing it with 1011.
