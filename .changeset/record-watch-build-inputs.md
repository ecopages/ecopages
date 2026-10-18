---
'@ecopages/core': minor
'ecopages': minor
---

During development, a change to a recorded build input marks only dependent Pages, HTML documents, browser entrypoints, and server routes dirty for rebuild. Changes matched by `additionalWatchPaths` invalidate all cached HTML documents because Ecopages cannot know which Pages read those arbitrary files. Public assets continue to trigger a browser reload.
