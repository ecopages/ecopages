---
'@ecopages/core': minor
'@ecopages/content-processor': minor
---

In development, routes listed in `devPrewarmPaths` and content collection `devPrewarm` render in the background. The server reports that it is listening without waiting for them, and Integration `setup()` now finishes before that message.

When an app stops or a development server restarts, queued prewarm renders are skipped and any render in progress finishes first. Core then calls each Integration's `teardown()` and runs `setup()` again on the next start, so Lit workers no longer survive restarts. Integrations must keep `setup()` safe to run more than once.

The content processor adds its collection pathnames to `devPrewarmPaths` in `setup()`, from the manifests it has just generated. An error reading a manifest there now fails startup, like any other `setup()` error, instead of being logged after the server is ready. Core renders the de-duplicated list in the background; a path that fails to render is skipped and logged at debug level.

**Breaking:**

- `devPrewarmBeforeReadyPaths` is removed; use `devPrewarmPaths`.
- Content collection `devPrewarmReadiness` is removed; every declared path renders in the background.
- `Processor.collectDevPrewarmPlan()` is removed. A Processor that owns pages to prewarm appends their pathnames to `this.context.config.devPrewarmPaths` from `setup()`; core renders that one list.
