---
'@ecopages/core': patch
---

Saving a page or island entry in `ecopages dev` no longer marks its server modules stale a second time or imports them again on the file event. The server code is rebuilt on the next request, like every other edit, so a save does less work before the browser update is sent.
