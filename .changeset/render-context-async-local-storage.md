---
'@ecopages/core': patch
---

The component render context always uses `AsyncLocalStorage`. The in-memory stack that stood in when `node:async_hooks` could not be imported is removed; a stack cannot follow renders that overlap, and every supported runtime provides `node:async_hooks`.
