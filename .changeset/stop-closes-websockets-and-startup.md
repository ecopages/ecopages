---
'@ecopages/core': patch
---

Fix app shutdown hanging or leaking a server. Stopping an app now completes while WebSocket clients are connected, so `ecopages dev` restarts after a config or `.env` edit even with a browser tab open. Calling `stop()` while `start()` is still running ends the startup, leaves nothing listening, and does not start the app again.
