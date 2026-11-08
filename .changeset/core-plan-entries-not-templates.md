---
'@ecopages/core': patch
---

A production build no longer plans a dynamic Page as a parameter-free route template when its `staticPaths` already lists entries. The build plans it once per entry with that entry's Params, so a Page whose Dependencies read its props no longer logs "Could not plan ... without request props".
