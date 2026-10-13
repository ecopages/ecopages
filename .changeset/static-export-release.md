---
'@ecopages/core': minor
'@ecopages/lit': minor
---

Static export releases what an Integration started for it. `IntegrationPlugin.staticExport(context)` replaces `beforeStaticExport(context)` and may return a function that core awaits once the export ends, on success or failure, in reverse order of the Integrations. The Lit Integration stops its render worker through it, so an in-process export no longer leaves the worker thread running. When `ecopages build` defers setup and the first page render runs the Lit `setup()`, it reuses the session `staticExport()` started instead of starting a second worker.

`ecopages build` no longer calls `process.exit(0)` after the export; the process ends on its own once the releases have run.

**Breaking:**

- `IntegrationPlugin.beforeStaticExport()` is gone. Rename your override to `staticExport()`; it receives the same `StaticExportContext`. To clean up after the export, return an async function from it instead of relying on the process exiting. A release that throws is logged and does not fail the export.
- `ecopages build` ends when nothing keeps the event loop alive. An Integration or Processor that leaves a worker, timer or socket running now keeps the build open; stop it in the release returned from `staticExport()` or in `teardown()`.
- `StaticExportRelease` is exported from `@ecopages/core/plugins/integration-plugin`.
