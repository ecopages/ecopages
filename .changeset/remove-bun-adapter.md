---
'@ecopages/core': minor
---

`createApp()` always uses the Node HTTP host. A Bun process still logs `Bun server running at`, because that line names the runtime that launched the process.

**Breaking:**

- `createApp({ adapter })` is removed. There is no Bun adapter and no `adapter: 'auto'`.
- `createApp()` no longer takes a WebSocket data type argument.
- On Bun, `serverOptions` no longer reach `Bun.serve`. Only `port` and `hostname` are read, so Bun-only keys such as `tls` and `idleTimeout` are ignored.
