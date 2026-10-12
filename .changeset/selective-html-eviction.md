---
'@ecopages/core': patch
'@ecopages/lit': patch
---

Editing a source file or a processor-owned asset in development evicts only the cached pages that used it, instead of every cached page. Pages rendered by the Lit worker and pages that import the HTML template's includes now record those files, so their cached output follows them.
