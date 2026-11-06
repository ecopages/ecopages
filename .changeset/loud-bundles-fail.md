---
'@ecopages/core': patch
---

Fail `ecopages build` when a Page script or stylesheet cannot be bundled, such as a browser import of a `.server` module or a package CSS import, instead of logging the error, dropping the script and exiting 0.
