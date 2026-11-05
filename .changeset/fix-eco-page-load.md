---
'@ecopages/core': patch
'@ecopages/browser-router': patch
---

Fix `eco:page-load` never firing. The Browser Router now dispatches it once on first load and after every committed navigation; it is skipped only when a newer navigation replaces the one that committed.
