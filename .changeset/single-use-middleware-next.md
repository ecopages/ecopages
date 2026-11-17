---
'@ecopages/core': patch
---

A middleware stage can now continue the chain only once. Before, a stage that called `next()` a second time resumed the chain behind a guard that had already answered, so the protected handler could run, and run a second time. A second call now throws before the chain advances and the request fails with a 500. Middleware that calls `next()` once is unaffected.
