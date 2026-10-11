---
'@ecopages/vite-plugin': patch
---

The Vite host logs that the Node server is running only after its HTTP listener is bound, integration warmup completes, and the Project Watcher initializes. Restart callbacks wait for this readiness boundary and ignore events from a stopped server, preventing overlapping restarts from moving the listener to another port. Closing the server cancels a listen wait that has not settled. When the port is in use and Vite retries the next one, the app still starts and serves requests.
