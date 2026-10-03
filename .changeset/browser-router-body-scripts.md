---
'@ecopages/browser-router': minor
---

Fix body scripts not running after client navigation. Every script in the incoming page's `<body>` now runs after the swap, as in Turbo, even when the previous page had the same script; a script inside an element marked `data-eco-persist` is kept as it was and does not run again. A body script that adds `window` or `document` listeners now adds them on each navigation, so make it idempotent or mark it `data-eco-persist`. New head scripts run only when the previous page's head did not have them. New head scripts are inserted first, then body scripts, each in document order and each after earlier external classic scripts (without `async`, `defer`, or `nomodule`) have loaded, so an inline script that uses a library the page loads, in the head or the body, runs after it.
