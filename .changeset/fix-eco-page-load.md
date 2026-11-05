---
'@ecopages/core': patch
'@ecopages/browser-router': patch
'@ecopages/react-router': patch
---

Fix `eco:page-load` never firing. The Browser Router and the React Router now dispatch it once on first load and after every committed navigation; it is skipped only when a newer navigation replaces the one that committed.
