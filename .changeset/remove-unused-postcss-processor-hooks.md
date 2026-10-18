---
'@ecopages/postcss-processor': patch
---

Drop the unused `description` it passed to `ProcessorConfig` and its no-op `teardown()` override. Behavior does not change.
