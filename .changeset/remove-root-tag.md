---
'@ecopages/core': minor
---

A component render no longer reports the tag of its root element.

**Breaking:** `ComponentRenderResult` and `ForeignSubtreeRenderPayload` lose `rootTag`, and `IntegrationRenderer` loses `getRootTagName()`. Nothing in core read the value; it was computed with a regex on every component render. A custom Integration that returns `rootTag` from `renderComponent` should drop it.
