---
'@ecopages/browser-router': minor
'@ecopages/core': minor
---

Submit a same-origin `<form method="get">` as a client navigation. The router goes to the form's action with the fields as the query, the URL the browser would load, so a search box or a filter form needs no script of its own and still works without JavaScript. The submitter's `formaction`, `formmethod` and `formtarget` win over the form's, and the router leaves a form to the browser when its method is not GET, its `target` is not `_self`, its action is on another origin or a static file, a `submit` listener already called `preventDefault()`, or the form or its submit button has `data-eco-reload` (the `reloadAttribute`). `@ecopages/core/client` exports `getFormNavigationDecision()` and `getNavigableHrefFromSubmit()` for it.
