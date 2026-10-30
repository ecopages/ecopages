---
'@ecopages/core': minor
---

Prevent incoming stylesheets from affecting the outgoing page and preserve the cascade order of uniquely keyed styles during navigation. Fall back to full document navigation if a stylesheet replacement fails, retained CSS changes order while a retained style or stylesheet is persisted, or another update invalidates the prepared stylesheet order.

**Breaking:** Consumers of `prepareNavigationHead()` must check `requiresReload` immediately before committing. If it is true, cancel the update and navigate the document instead. Custom implementations of `NavigationHeadUpdate` must provide the new property.
