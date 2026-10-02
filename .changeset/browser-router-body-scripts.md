---
'@ecopages/browser-router': minor
---

Fix body scripts not running after client navigation. A script in the incoming page's `<body>` that the previous page did not have now runs after the swap, like new head scripts. New head and body scripts are inserted in document order, each after earlier blocking classic scripts (without `async`, `defer`, or `nomodule`) have loaded, so an inline script that uses a library the page loads, in the head or the body, runs after it.
