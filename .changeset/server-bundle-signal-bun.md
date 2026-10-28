---
'@ecopages/core': patch
---

A production server bundle started with Bun (`bun dist/server/app.mjs` or `ecopages start --runtime bun`) now loads its emitted config and checks that `dist/` is complete, as it does under Node. `ecopages start` without `--dist-dir` no longer mistakes a project folder that holds a `server/manifest.json`, such as `src/server/`, for a build output.
