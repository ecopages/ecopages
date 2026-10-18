---
'@ecopages/core': patch
---

Server builds resolve Core runtime imports without changing authored text that happens to look like an import. Browser assets keep their final generated names and URLs.
