---
'@ecopages/react': patch
'@ecopages/core': patch
---

Internal fix: a Component another Integration owns no longer renders as a React element when its own Integration's browser code calls it on a page that also has a React Island. React now swaps the boundary in when it builds its own modules, and the browser `eco.component` factory renders inline for every caller. Nothing changes for how Components are written or imported.
