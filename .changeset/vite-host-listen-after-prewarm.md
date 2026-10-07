---
'@ecopages/vite-plugin': patch
---

The Vite host now logs that the Node server is running only after integration warmup and `devPrewarmBeforeReadyPaths`. Playwright and other listen-log waiters no longer start hitting pages while those routes are still a cold compile.
