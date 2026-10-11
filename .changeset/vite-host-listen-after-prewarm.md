---
'@ecopages/vite-plugin': patch
---

The Vite host logs that the server is running only after the app has initialized and the HTTP listener is bound. Editing `app.ts` while the server is still starting no longer triggers overlapping restarts that move the server to another port, and closing the server during startup no longer hangs. When the port is in use and Vite binds the next one, the app starts, logs the port it bound and serves requests with that origin.
