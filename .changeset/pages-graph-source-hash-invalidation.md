---
'@ecopages/core': patch
---

Production page-graph cache now rebuilds when a layout or component source file changes or is deleted. Incremental HTML reuse is also dropped when that module is rebuilt, so a removed island cannot keep showing up in `dist/`.
