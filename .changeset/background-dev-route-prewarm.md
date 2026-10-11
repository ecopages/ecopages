---
'@ecopages/core': patch
'@ecopages/content-processor': patch
---

Development static route prewarm now runs asynchronously in the background after the response pipeline is ready, removing Page prewarming from the startup readiness gate.

Stop queued Page prewarming and finish active prewarm renders before releasing Integration runtime resources during app shutdown, so Lit workers do not survive development server restarts.

Remove `devPrewarmBeforeReadyPaths`; configure `devPrewarmPaths` instead. Remove content collection `devPrewarmReadiness` and Processor prewarm-plan `readiness`; all declared paths render in the background.
