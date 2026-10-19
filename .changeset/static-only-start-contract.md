---
'ecopages': patch
'@ecopages/core': patch
---

`ecopages start` now explains a static-only build. An app with no API or WebSocket handlers builds no server bundle, so `start` cannot run it; when `dist` (or the `--dist-dir` directory) holds built HTML, the command says so and points to `ecopages preview` or a static host instead of asking for another build. The static templates now start with `ecopages preview`, so `pnpm start` works in them.
