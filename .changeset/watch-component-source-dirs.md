---
'@ecopages/core': patch
---

Development watches component, include, layout, and explicit-view source directories so nested Component and barrel edits invalidate HTML. Discovered factory modules are recorded as watch files, and a server-source change drops cached HTML documents.

Development startup waits for filesystem subscriptions before advertising readiness, so immediate edits are observed. New source files invalidate immediately even when copied with preserved timestamps.
