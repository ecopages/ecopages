---
'@ecopages/browser-router': minor
---

Inline and external classic scripts in the incoming page's `<body>` run after every client-side page swap, even when the previous page had the same script. External module scripts still run once per URL, as the browser evaluates each module URL once. Scripts inside elements marked `data-eco-persist` are kept and do not run again. New head scripts run only when the previous page's head did not have them. Scripts run in sequence: new head scripts, then `data-eco-rerun` scripts, then body scripts, in document order and after earlier external classic scripts (without `async`, `defer`, or `nomodule`) load. If navigation swaps the page while a script is loading, the rest of that sequence does not run.

**Breaking:** Classic body scripts run again on every visit. Move top-level `const`, `let`, and `class` declarations into a block or use a module script; make listener setup idempotent, or place the script in an element marked `data-eco-persist`.
