---
'@ecopages/core': patch
'@ecopages/browser-router': patch
---

Keep component state when a page or layout is saved in development. A page, layout or component template (Kita, Lit, MDX, HTML Page) that the browser does not load as a module now refreshes the page in place when a navigation runtime such as `@ecopages/browser-router` is active, and still reloads the document otherwise. On that refresh, `@ecopages/browser-router` compares each element's previous server markup with its new server markup and keeps every element that did not change, so custom elements keep their state and stay connected, and classes or attributes added at runtime stay. On that refresh, `data-eco-rerun` scripts no longer refresh the elements around them, so a rerun script must register handlers idempotently on every element that is not replaced. Navigation to another URL is unchanged.
