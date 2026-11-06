---
'@ecopages/core': patch
---

A page rendered while a production build plans its routes now links its component scripts; before, it could get a script tag without a URL.
