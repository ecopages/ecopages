---
'@ecopages/core': minor
'@ecopages/content-processor': minor
---

In development, routes listed in `devPrewarmPaths` and content collection `devPrewarm` render in the background. The server reports that it is listening without waiting for them, and Integration `setup()` now finishes before that message.

When an app stops or a development server restarts, queued prewarm renders are skipped and any render in progress finishes first. Core then calls each Integration's `teardown()` and runs `setup()` again on the next start, so Lit workers no longer survive restarts. Integrations must keep `setup()` safe to run more than once.

`devPrewarmBeforeReadyPaths` is removed; use `devPrewarmPaths`. Content collection `devPrewarmReadiness` is removed; every declared path renders in the background. Processors declare prewarm paths with `collectDevPrewarmPaths()`, which returns the pathnames directly and replaces `collectDevPrewarmPlan()`.
